/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as analysis from "../analysis.js";
import type * as analytics from "../analytics.js";
import type * as creatives from "../creatives.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as gemini from "../gemini.js";
import type * as lib_currency from "../lib/currency.js";
import type * as meta from "../meta.js";
import type * as reports from "../reports.js";
import type * as settings from "../settings.js";
import type * as sync from "../sync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  analysis: typeof analysis;
  analytics: typeof analytics;
  creatives: typeof creatives;
  crons: typeof crons;
  dashboard: typeof dashboard;
  gemini: typeof gemini;
  "lib/currency": typeof lib_currency;
  meta: typeof meta;
  reports: typeof reports;
  settings: typeof settings;
  sync: typeof sync;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
