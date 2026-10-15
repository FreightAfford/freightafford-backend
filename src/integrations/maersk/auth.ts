import axios from "axios";
import envConfig from "../../configurations/env.configuration.js";

// Maersk OAuth2 client credentials. Products that need it (Track & Trace,
// later Schedules, Booking and Offers) send this token as a Bearer header
// alongside Consumer-Key. Tokens last ~2 hours; one is shared and renewed a
// minute before it expires.

const EXPIRY_MARGIN = 60 * 1000;

let token: { value: string; expiresAt: number } | null = null;
let pending: Promise<string> | null = null;

const requestToken = async () => {
  const { data } = await axios.post<{
    access_token: string;
    expires_in: number;
  }>(
    envConfig.MAERSK_TOKEN_URL,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: envConfig.MAERSK_API_KEY,
      client_secret: envConfig.MAERSK_API_SECRET,
    }),
    {
      timeout: 15_000,
      headers: {
        "Consumer-Key": envConfig.MAERSK_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
    },
  );

  token = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - EXPIRY_MARGIN,
  };
  return token.value;
};

export const getMaerskAccessToken = async () => {
  if (token && token.expiresAt > Date.now()) return token.value;
  // Concurrent callers share one token request
  pending ??= requestToken().finally(() => {
    pending = null;
  });
  return pending;
};

// Drop the cached token, e.g. after Maersk rejects it with a 401
export const clearMaerskAccessToken = () => {
  token = null;
};
