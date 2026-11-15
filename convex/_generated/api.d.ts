/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as bench from "../bench.js";
import type * as cache from "../cache.js";
import type * as drugRules from "../drugRules.js";
import type * as followups from "../followups.js";
import type * as judge from "../judge.js";
import type * as lookup from "../lookup.js";
import type * as medications from "../medications.js";
import type * as pipeline from "../pipeline.js";
import type * as profile from "../profile.js";
import type * as rules from "../rules.js";
import type * as scans from "../scans.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  bench: typeof bench;
  cache: typeof cache;
  drugRules: typeof drugRules;
  followups: typeof followups;
  judge: typeof judge;
  lookup: typeof lookup;
  medications: typeof medications;
  pipeline: typeof pipeline;
  profile: typeof profile;
  rules: typeof rules;
  scans: typeof scans;
  validators: typeof validators;
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
