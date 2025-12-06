"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callDataApi = callDataApi;
/**
 * Quick example (matches curl usage):
 *   await callDataApi("Youtube/search", {
 *     query: { gl: "US", hl: "en", q: "manus" },
 *   })
 */
const env_1 = require("./env");
async function callDataApi(apiId, options = {}) {
    if (!env_1.ENV.forgeApiUrl) {
        throw new Error("BUILT_IN_FORGE_API_URL is not configured");
    }
    if (!env_1.ENV.forgeApiKey) {
        throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
    }
    // Build the full URL by appending the service path to the base URL
    const baseUrl = env_1.ENV.forgeApiUrl.endsWith("/") ? env_1.ENV.forgeApiUrl : `${env_1.ENV.forgeApiUrl}/`;
    const fullUrl = new URL("webdevtoken.v1.WebDevService/CallApi", baseUrl).toString();
    const response = await fetch(fullUrl, {
        method: "POST",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
            "connect-protocol-version": "1",
            authorization: `Bearer ${env_1.ENV.forgeApiKey}`,
        },
        body: JSON.stringify({
            apiId,
            query: options.query,
            body: options.body,
            path_params: options.pathParams,
            multipart_form_data: options.formData,
        }),
    });
    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Data API request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`);
    }
    const payload = await response.json().catch(() => ({}));
    if (payload && typeof payload === "object" && "jsonData" in payload) {
        try {
            return JSON.parse(payload.jsonData ?? "{}");
        }
        catch {
            return payload.jsonData;
        }
    }
    return payload;
}
