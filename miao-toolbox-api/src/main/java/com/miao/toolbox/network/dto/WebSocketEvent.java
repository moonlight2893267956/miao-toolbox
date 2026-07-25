package com.miao.toolbox.network.dto;

/**
 * WebSocket 测试器推送给前端的实时事件。
 * type: connected / sent / received / closing / closed / error
 */
public class WebSocketEvent {

    private String type;
    private String message;
    private Integer code;
    private String reason;
    private long timestamp = System.currentTimeMillis();

    public static WebSocketEvent connected() {
        WebSocketEvent e = new WebSocketEvent();
        e.type = "connected";
        return e;
    }

    public static WebSocketEvent sent(String message) {
        WebSocketEvent e = new WebSocketEvent();
        e.type = "sent";
        e.message = message;
        return e;
    }

    public static WebSocketEvent received(String message) {
        WebSocketEvent e = new WebSocketEvent();
        e.type = "received";
        e.message = message;
        return e;
    }

    public static WebSocketEvent closing(int code, String reason) {
        WebSocketEvent e = new WebSocketEvent();
        e.type = "closing";
        e.code = code;
        e.reason = reason;
        return e;
    }

    public static WebSocketEvent closed(int code, String reason) {
        WebSocketEvent e = new WebSocketEvent();
        e.type = "closed";
        e.code = code;
        e.reason = reason;
        return e;
    }

    public static WebSocketEvent error(String message) {
        WebSocketEvent e = new WebSocketEvent();
        e.type = "error";
        e.message = message;
        return e;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public Integer getCode() {
        return code;
    }

    public void setCode(Integer code) {
        this.code = code;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public long getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(long timestamp) {
        this.timestamp = timestamp;
    }
}
