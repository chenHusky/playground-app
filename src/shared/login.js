import { ref, computed } from "vue";
import mitt from "@/shared/mitt";
import {
  queryAuthParams,
  queryAuthentication,
  queryUserInfo,
} from "@/service/api";
import { getAuthCode } from "./login-code";
import { isTestEnv } from "./utils";

export const LOGIN_EVENTS = {
  SHOW_LOGIN: "show-login",
  LOGOUT: "do-logout",
  LOGINED: "logined",
};

// -1: 登录失败；0：未登录；1：登录中；2：登录成功
export const LOGIN_STATUS = {
  FAILED: -1,
  NOT: 0,
  DOING: 1,
  DONE: 2,
};

const LOGIN_KEYS = {
  USER_TOKEN: "_U_T_",
  USER_ID: "_U_I_",
  REDIRECT_URI: "_R_I_",
};

export let loginStatus = ref(LOGIN_STATUS.NOT);
function setStatus(val) {
  loginStatus.value = val;
}

export const isLoggingIn = computed(() => {
  return loginStatus.value === LOGIN_STATUS.DOING;
});

let userInfo = null;
// 是否登录
export function isLogined() {
  return loginStatus.value === LOGIN_STATUS.DONE;
}
// 获取用户信息
export function getUserInfo() {
  if (isLogined()) {
    return userInfo;
  } else {
    return null;
  }
}

/**
 * 获取授权回调地址
 * @param {*} callbackUrl 测试环境时，设置指定的html，用于授权后跳转回之前的地址；现网直接使用当前地址
 * @returns 回调地址，用于url中的参数部分，需要encodeURIComponent处理
 */
export function getRedirectUri(callbackUrl) {
  const uri = isTestEnv()
    ? `${callbackUrl}?redirect=${encodeURIComponent(window.location.href)}`
    : window.location.href;

  return encodeURIComponent(uri);
}

// 登录
export function showLogin() {
  mitt.emit(LOGIN_EVENTS.SHOW_LOGIN);
}

// 注册
export async function doSignUp() {
  const code = getAuthCode();
  if (code) {
    try {
      setStatus(LOGIN_STATUS.DOING);
      // 从上次授权存储中获取
      const callbackUrl = sessionStorage.getItem(
        LOGIN_KEYS.REDIRECT_URI,
        callbackUrl
      );
      sessionStorage.removeItem(LOGIN_KEYS.REDIRECT_URI);

      const redirectUri = getRedirectUri(callbackUrl);

      const res = await queryAuthentication({
        code,
        redirectUri,
      });

      if (res.code === 200) {
        afterLogined(res.userInfo);
      } else {
        throw new Error(res.code + " " + res.message);
      }
    } catch (error) {
      setStatus(LOGIN_STATUS.FAILED);

      console.error("授权获取用户信息失败", error);
    }
  } else {
    requestUserInfo();
  }
}
// 去码云授权
export async function goAuthorize() {
  try {
    const res = await queryAuthParams();
    if (res.code !== 200) {
      throw new Error(res.code + res.message);
      return;
    }
    const { callbackUrl, clientId } = res.callbackInfo;
    // 存储回调地址，用于跳回后的授权接口使用，减少一次请求
    sessionStorage.setItem(LOGIN_KEYS.REDIRECT_URI, callbackUrl);

    // 现网环境使用当前页面地址
    const rUrl = getRedirectUri(callbackUrl);

    const url = `https://gitee.com/oauth/authorize?client_id=${clientId}&redirect_uri=${rUrl}&response_type=code`;

    window.location.href = url;
  } catch (error) {
    console.error("获取认证参数失败", error);
  }
}

// 存储用户id及token，用于下次登录
export function saveUserAuth(id, code) {
  if (!id && !code) {
    localStorage.removeItem(LOGIN_KEYS.USER_ID);
    localStorage.removeItem(LOGIN_KEYS.USER_TOKEN);
  } else {
    localStorage.setItem(LOGIN_KEYS.USER_ID, id);
    localStorage.setItem(LOGIN_KEYS.USER_TOKEN, code);
  }
}
// 获取用户id及token
export function getUserAuth() {
  let token = localStorage.getItem(LOGIN_KEYS.USER_TOKEN);
  let userId = localStorage.getItem(LOGIN_KEYS.USER_ID);
  if (token === "undefined" || userId === "undefined") {
    saveUserAuth();
    token = "";
    userId = -1;
  } else {
    userId = parseInt(userId);
  }
  return {
    userId,
    token,
  };
}
// 退出
export function logout() {
  setStatus(LOGIN_STATUS.NOT);
  userInfo = null;
  saveUserAuth();
  mitt.emit(LOGIN_EVENTS.LOGOUT);
}
// 请求用户信息
export async function requestUserInfo() {
  const { userId, token } = getUserAuth();
  if (userId && token) {
    try {
      setStatus(LOGIN_STATUS.DOING);

      const res = await queryUserInfo({
        token,
        userId,
      });
      if (res.code === 200) {
        afterLogined(res.userInfo);
      } else {
        throw new Error(res.code + " " + res.message);
      }
    } catch (err) {
      setStatus(LOGIN_STATUS.FAILED);

      saveUserAuth();
      console.error("获取用户信息失败", err);
    }
  }
}

function afterLogined(userInfo) {
  if (!userInfo || !userInfo.userId) {
    return;
  }
  saveUserAuth(userInfo.userId, userInfo.userToken);

  setStatus(LOGIN_STATUS.DONE);

  mitt.emit(LOGIN_EVENTS.LOGINED, userInfo);
}
