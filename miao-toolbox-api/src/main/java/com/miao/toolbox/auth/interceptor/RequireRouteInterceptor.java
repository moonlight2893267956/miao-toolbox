package com.miao.toolbox.auth.interceptor;

import com.miao.toolbox.auth.annotation.RequireRoute;
import com.miao.toolbox.auth.entity.User;
import com.miao.toolbox.auth.service.RouteAccessService;
import com.miao.toolbox.common.constant.ErrorCode;
import com.miao.toolbox.common.response.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;

/**
 * 基于 {@link RequireRoute} 注解的 API 访问拦截器。
 * <p>
 * 拦截规则：
 * <ul>
 *   <li>Controller 未标注 @RequireRoute → 默认放行</li>
 *   <li>用户拥有 SUPER_ADMIN 角色 → 直接放行（通过 GrantedAuthority 判断，避免 LAZY 加载）</li>
 *   <li>用户拥有对应路由码的访问权限（优先查 Redis 缓存）→ 放行</li>
 *   <li>路由码不存在于路由表中 → 返回 500（注解配置错误）</li>
 *   <li>否则 → 返回 403</li>
 * </ul>
 * <p>
 * 权限判断通过 {@link RouteAccessService} 完成，自动利用 Redis 缓存避免每次请求都查询 DB。
 */
@Slf4j
@Component
public class RequireRouteInterceptor implements HandlerInterceptor {

    private final ObjectMapper objectMapper;
    private final RouteAccessService routeAccessService;

    public RequireRouteInterceptor(ObjectMapper objectMapper, RouteAccessService routeAccessService) {
        this.objectMapper = objectMapper;
        this.routeAccessService = routeAccessService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        if (!(handler instanceof HandlerMethod handlerMethod)) {
            return true;
        }

        RequireRoute annotation = handlerMethod.getMethodAnnotation(RequireRoute.class);
        if (annotation == null) {
            annotation = handlerMethod.getBeanType().getAnnotation(RequireRoute.class);
        }
        if (annotation == null) {
            return true;
        }

        String requiredRoute = annotation.value();
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();

        // 未认证 → 放行给 Spring Security 处理
        if (auth == null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof User user)) {
            return true;
        }

        // 超级管理员全局通行
        boolean hasAccess = routeAccessService.canAccess(user.getId(), auth, requiredRoute);
        if (hasAccess) {
            return true;
        }

        writeForbidden(response);
        return false;
    }

    private void writeForbidden(HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        ApiResponse<Void> apiResponse = ApiResponse.error(
                ErrorCode.ROUTE_FORBIDDEN, "您没有该功能的访问权限", null);
        response.getWriter().write(objectMapper.writeValueAsString(apiResponse));
    }
}
