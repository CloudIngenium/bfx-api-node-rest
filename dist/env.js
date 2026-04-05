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
export function getEnvVar(varName, defaultValue = '') {
    const value = process.env[varName];
    return value && value.length > 0 ? value : defaultValue;
}
/**
 * Returns an environment variable and throws if it is missing/empty.
 */
export function getRequiredEnvVar(varName) {
    const value = process.env[varName];
    if (!value || value.length === 0) {
        throw new Error(`Required environment variable not found: ${varName}`);
    }
    return value;
}
/**
 * Parses an environment variable as a number.
 */
export function getEnvVarAsNumber(varName, defaultValue = 0) {
    const value = process.env[varName];
    if (!value || value.length === 0) {
        return defaultValue;
    }
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
}
/**
 * Parses an environment variable as an integer.
 */
export function getEnvVarAsInt(varName, defaultValue = 0) {
    const value = process.env[varName];
    if (!value || value.length === 0) {
        return defaultValue;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
}
/**
 * Parses an environment variable as a boolean.
 */
export function getEnvVarAsBoolean(varName, defaultValue = false) {
    const value = process.env[varName];
    if (!value || value.length === 0) {
        return defaultValue;
    }
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}
/**
 * Parses a comma-separated environment variable into an array.
 */
export function getEnvVarAsArray(varName, defaultValue = []) {
    const value = process.env[varName];
    if (!value || value.length === 0) {
        return defaultValue;
    }
    return value
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
}
//# sourceMappingURL=env.js.map