package com.miao.toolbox.config;

import com.miao.toolbox.auth.filter.JwtAuthFilter;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.gateway.filter.AntiReplayFilter;
import com.miao.toolbox.gateway.filter.RateLimitFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import jakarta.servlet.DispatcherType;
import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final ObjectMapper objectMapper;

    @Autowired(required = false)
    private AntiReplayFilter antiReplayFilter;

    @Autowired(required = false)
    private RateLimitFilter rateLimitFilter;

    @Value("${miao.cors.allowed-origins}")
    private String allowedOrigins;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter, ObjectMapper objectMapper) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.objectMapper = objectMapper;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(ex -> ex
                        // 未认证请求返回 401（而不是默认的 403），前端才能正确触发 token 刷新
                        .authenticationEntryPoint(jwtAuthEntryPoint())
                )
                .authorizeHttpRequests(auth -> auth
                        // SSE 异步回写（async dispatch）不重新验证权限
                        // SseEmitter.send() → Tomcat async dispatch → FilterChain 重走 →
                        // SecurityContextHolder(ThreadLocal) 无认证信息 → AuthorizationFilter 拒绝。
                        // ASYNC dispatch 是同一 HTTP 连接上的延续请求，初始已认证，放行是安全的。
                        .dispatcherTypeMatchers(DispatcherType.ASYNC).permitAll()
                        .requestMatchers(
                                "/api/auth/register",
                                "/api/auth/login",
                                "/api/auth/refresh",
                                "/api/auth/oauth/**",
                                "/actuator/health",
                                "/swagger-ui/**",
                                "/v3/api-docs/**",
                                "/error"
                        ).permitAll()
                        .requestMatchers("/api/admin/**").hasRole("SUPER_ADMIN")
                        .anyRequest().authenticated()
                );

        // Register filters — all anchored to UsernamePasswordAuthenticationFilter
        // to avoid "does not have a registered order" in Spring Boot 4.x
        // Order (before UsernamePasswordAuthenticationFilter):
        //   1. AntiReplayFilter  2. JwtAuthFilter  3. RateLimitFilter
        if (antiReplayFilter != null) {
            http.addFilterBefore(antiReplayFilter, UsernamePasswordAuthenticationFilter.class);
        }
        http.addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        if (rateLimitFilter != null) {
            http.addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class);
        }

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.asList(allowedOrigins.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of(
                "Authorization",
                "Content-Type",
                "X-Requested-With",
                "X-Request-Timestamp",
                "X-Request-Nonce",
                "X-Request-Signature"
        ));
        config.setExposedHeaders(List.of("X-Request-Id"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    /**
     * 禁用 JwtAuthFilter 的 Servlet 容器自动注册，
     * 仅通过 SecurityFilterChain 注册（避免 "does not have a registered order" 错误）。
     */
    @Bean
    public FilterRegistrationBean<JwtAuthFilter> jwtAuthFilterRegistration(JwtAuthFilter filter) {
        FilterRegistrationBean<JwtAuthFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    /**
     * 自定义 AuthenticationEntryPoint：未认证请求返回 401 + JSON body，
     * 而不是 Spring Security 默认的 403。
     * 前端 axios 拦截器依赖 401 状态码触发 token 刷新。
     */
    @Bean
    public AuthenticationEntryPoint jwtAuthEntryPoint() {
        return (request, response, authException) -> {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            ApiResponse<Void> apiResponse = ApiResponse.error(
                    ErrorCode.AUTH_TOKEN_EXPIRED, "登录已过期，请重新登录", null);
            response.getWriter().write(objectMapper.writeValueAsString(apiResponse));
        };
    }
}
