package com.miao.toolbox.auth.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 声明 Controller 所需的路由码。
 * 标注在类上时，该 Controller 的所有接口都需要对应的路由权限。
 * 标注在方法上时，仅该方法需要对应的路由权限（覆盖类级别）。
 * 超级管理员（SUPER_ADMIN）隐式放行。
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequireRoute {
    /** 路由码，例如 "TOOL_TEXT_COMPARE" */
    String value();
}
