var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
/**
 * Serves the Vercel functions in /api from the Vite dev server, so `npm run dev` works without
 * `vercel dev`. Dev only; production uses Vercel's own function runtime.
 */
function vercelApiDevPlugin() {
    var apiRoot = path.resolve(__dirname, "api");
    return {
        name: "vercel-api-dev",
        apply: "serve",
        configureServer: function (server) {
            var _this = this;
            if (process.env.VITEST)
                return;
            // Functions read server-side secrets (e.g. ANTHROPIC_API_KEY) from process.env, as on Vercel.
            var env = loadEnv(server.config.mode, __dirname, "");
            for (var _i = 0, _a = Object.entries(env); _i < _a.length; _i++) {
                var _b = _a[_i], key = _b[0], value = _b[1];
                if (process.env[key] === undefined)
                    process.env[key] = value;
            }
            server.middlewares.use(function (req, res, next) { return __awaiter(_this, void 0, void 0, function () {
                var pathname, file, sendJson, chunks, chunk, e_1_1, raw, body, url, vercelReq, vercelRes, mod, error_1;
                var _a, req_1, req_1_1;
                var _b, e_1, _c, _d;
                var _e, _f, _g;
                return __generator(this, function (_h) {
                    switch (_h.label) {
                        case 0:
                            pathname = ((_e = req.url) !== null && _e !== void 0 ? _e : "").split("?")[0];
                            if (!pathname.startsWith("/api/"))
                                return [2 /*return*/, next()];
                            file = path.resolve(__dirname, ".".concat(pathname, ".ts"));
                            if (!file.startsWith(apiRoot + path.sep) || path.basename(file).startsWith("_") || !fs.existsSync(file)) {
                                return [2 /*return*/, next()];
                            }
                            sendJson = function (status, payload) {
                                res.statusCode = status;
                                res.setHeader("Content-Type", "application/json");
                                res.end(JSON.stringify(payload));
                            };
                            chunks = [];
                            _h.label = 1;
                        case 1:
                            _h.trys.push([1, 6, 7, 12]);
                            _a = true, req_1 = __asyncValues(req);
                            _h.label = 2;
                        case 2: return [4 /*yield*/, req_1.next()];
                        case 3:
                            if (!(req_1_1 = _h.sent(), _b = req_1_1.done, !_b)) return [3 /*break*/, 5];
                            _d = req_1_1.value;
                            _a = false;
                            chunk = _d;
                            chunks.push(chunk);
                            _h.label = 4;
                        case 4:
                            _a = true;
                            return [3 /*break*/, 2];
                        case 5: return [3 /*break*/, 12];
                        case 6:
                            e_1_1 = _h.sent();
                            e_1 = { error: e_1_1 };
                            return [3 /*break*/, 12];
                        case 7:
                            _h.trys.push([7, , 10, 11]);
                            if (!(!_a && !_b && (_c = req_1.return))) return [3 /*break*/, 9];
                            return [4 /*yield*/, _c.call(req_1)];
                        case 8:
                            _h.sent();
                            _h.label = 9;
                        case 9: return [3 /*break*/, 11];
                        case 10:
                            if (e_1) throw e_1.error;
                            return [7 /*endfinally*/];
                        case 11: return [7 /*endfinally*/];
                        case 12:
                            raw = Buffer.concat(chunks).toString("utf8");
                            body = raw;
                            if (raw && String((_f = req.headers["content-type"]) !== null && _f !== void 0 ? _f : "").includes("application/json")) {
                                try {
                                    body = JSON.parse(raw);
                                }
                                catch (_j) {
                                    return [2 /*return*/, sendJson(400, { error: "Invalid JSON body." })];
                                }
                            }
                            url = new URL((_g = req.url) !== null && _g !== void 0 ? _g : "/", "http://localhost");
                            vercelReq = Object.assign(req, { body: body, query: Object.fromEntries(url.searchParams), cookies: {} });
                            vercelRes = Object.assign(res, {
                                status: function (code) {
                                    res.statusCode = code;
                                    return vercelRes;
                                },
                                json: function (payload) {
                                    sendJson(res.statusCode || 200, payload);
                                    return vercelRes;
                                },
                                send: function (payload) {
                                    res.end(typeof payload === "string" || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload));
                                    return vercelRes;
                                },
                            });
                            _h.label = 13;
                        case 13:
                            _h.trys.push([13, 16, , 17]);
                            return [4 /*yield*/, server.ssrLoadModule(file)];
                        case 14:
                            mod = (_h.sent());
                            if (typeof mod.default !== "function")
                                return [2 /*return*/, sendJson(500, { error: "".concat(pathname, " has no default export.") })];
                            return [4 /*yield*/, mod.default(vercelReq, vercelRes)];
                        case 15:
                            _h.sent();
                            return [3 /*break*/, 17];
                        case 16:
                            error_1 = _h.sent();
                            if (error_1 instanceof Error)
                                server.ssrFixStacktrace(error_1);
                            server.config.logger.error("[api] ".concat(pathname, " failed: ").concat(error_1 instanceof Error ? error_1.stack : String(error_1)));
                            if (!res.headersSent)
                                sendJson(500, { error: "API route crashed. See the dev server terminal." });
                            return [3 /*break*/, 17];
                        case 17: return [2 /*return*/];
                    }
                });
            }); });
        },
    };
}
export default defineConfig({
    plugins: [react(), vercelApiDevPlugin()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: "./src/test/setup.ts",
    },
});
