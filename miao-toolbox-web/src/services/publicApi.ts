import axios from 'axios';

/**
 * 公开接口专用的裸 axios 实例
 *
 * 与 services/axiosInstance 的区别：
 * - 不注入 Authorization 请求头（访客无登录态）
 * - 不注入 HMAC 签名头（X-Request-Timestamp/Nonce/Signature，访客无 signingKey）
 * - 不挂载 401 静默刷新拦截器（外链分享接口不会返回 401，
 *   若误接 401 逻辑会把访客跳转到 /login）
 *
 * 仅用于免登的公开端点，如 /api/public/share/**
 */
const publicApi = axios.create({
  baseURL: '',
  timeout: 30000,
});

export default publicApi;
