/**
 * Retry with exponential backoff for external API calls.
 */

export async function withRetry(fn, { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, label = '' } = {}) {
  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt === maxRetries) break

      // Respect Retry-After header for rate limiting
      const retryAfter = err.headers?.get?.('retry-after')
      let delay
      if (retryAfter) {
        delay = parseInt(retryAfter) * 1000
      } else {
        // Exponential backoff with jitter
        delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 1000, maxDelay)
      }

      if (label) console.warn(`[retry] ${label} attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms:`, err.message)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw lastError
}
