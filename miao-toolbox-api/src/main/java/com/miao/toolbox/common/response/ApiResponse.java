package com.miao.toolbox.common.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {

    private String code;
    private T data;
    private String message;
    private String requestId;

    private ApiResponse() {}

    public static <T> ApiResponse<T> success(T data) {
        ApiResponse<T> response = new ApiResponse<>();
        response.code = "SUCCESS";
        response.data = data;
        return response;
    }

    public static <T> ApiResponse<T> success(T data, String requestId) {
        ApiResponse<T> response = success(data);
        response.requestId = requestId;
        return response;
    }

    public static <T> ApiResponse<T> error(String code, String message) {
        ApiResponse<T> response = new ApiResponse<>();
        response.code = code;
        response.message = message;
        return response;
    }

    public static <T> ApiResponse<T> error(String code, String message, String requestId) {
        ApiResponse<T> response = error(code, message);
        response.requestId = requestId;
        return response;
    }
}
