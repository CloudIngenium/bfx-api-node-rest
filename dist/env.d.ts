/**
 * Environment variable helpers for runtime consumers.
 *
 * These helpers intentionally avoid loading dotenv or touching the filesystem.
 * They provide a small, portable API for services that already receive environment
 * variables from their process manager, shell, or Node's --env-file flag.
 */
/**
 * Returns an environment variable or a default value when it is missing/empty.
 */
export declare function getEnvVar(varName: string, defaultValue?: string): string;
/**
 * Returns an environment variable and throws if it is missing/empty.
 */
export declare function getRequiredEnvVar(varName: string): string;
/**
 * Parses an environment variable as a number.
 */
export declare function getEnvVarAsNumber(varName: string, defaultValue?: number): number;
/**
 * Parses an environment variable as an integer.
 */
export declare function getEnvVarAsInt(varName: string, defaultValue?: number): number;
/**
 * Parses an environment variable as a boolean.
 */
export declare function getEnvVarAsBoolean(varName: string, defaultValue?: boolean): boolean;
/**
 * Parses a comma-separated environment variable into an array.
 */
export declare function getEnvVarAsArray(varName: string, defaultValue?: string[]): string[];
