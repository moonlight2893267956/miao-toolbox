package com.miao.toolbox.auth.filter;

import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.repository.UserRepository;
import com.miao.toolbox.auth.service.JwtService;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.constant.RedisKey;
import com.miao.toolbox.common.response.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.annotation.Order;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    @Autowired(required = false)
    private RedisTemplate<String, Object> redisTemplate;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7);
        Claims claims = jwtService.validateAccessToken(token);
        if (claims == null) {
            // Token 过期或无效：直接返回 401，而不是放行让 Spring Security 返回 403
            // 前端只对 401 做 token 刷新，403 会被当作权限不足处理
            writeError(response, ErrorCode.AUTH_TOKEN_EXPIRED, "登录已过期，请重新登录", HttpStatus.UNAUTHORIZED);
            return;
        }

        Long userId = jwtService.extractUserId(claims);
        String username = jwtService.extractUsername(claims);
        List<String> roles = jwtService.extractRoles(claims);

        // Check user status from DB — use generic AUTH_LOGIN_FAILED to prevent user enumeration
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            writeError(response, ErrorCode.AUTH_TOKEN_INVALID, "无效的认证令牌", HttpStatus.UNAUTHORIZED);
            return;
        }

        if (!user.getIsEnabled() || (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now(ZoneOffset.UTC)))) {
            writeError(response, ErrorCode.AUTH_LOGIN_FAILED, "认证失败，请重新登录", HttpStatus.UNAUTHORIZED);
            return;
        }

        // Check Redis disable flag for instant effect
        if (redisTemplate != null) {
            Object statusFlag = redisTemplate.opsForValue().get(RedisKey.USER_STATUS_PREFIX + userId);
            if ("disabled".equals(statusFlag != null ? statusFlag.toString() : null)) {
                writeError(response, ErrorCode.USER_DISABLED, "账号已被禁用，请联系管理员", HttpStatus.UNAUTHORIZED);
                return;
            }
        }

        List<SimpleGrantedAuthority> authorities = roles.stream()
                .map(r -> new SimpleGrantedAuthority("ROLE_" + r))
                .collect(Collectors.toList());

        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(
                        user,
                        null,
                        authorities
                );
        authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(authentication);

        filterChain.doFilter(request, response);
    }

    private void writeError(HttpServletResponse response, String errorCode, String message, HttpStatus status) throws IOException {
        response.setStatus(status.value());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        ApiResponse<Void> apiResponse = ApiResponse.error(errorCode, message, null);
        response.getWriter().write(objectMapper.writeValueAsString(apiResponse));
    }
}
