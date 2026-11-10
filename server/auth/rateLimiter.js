// ==============================================================================
// Redis Cache-Aside Rate Limiter for Authentication
// Rate-limits login and signup per IP and per username
// ==============================================================================

export class AuthRateLimiter {
  constructor(dataStore) {
    this.dataStore = dataStore;
    // In-memory fallback if Redis is unreachable
    this.memoryFailures = new Map(); // key -> { count, cooldownUntil }
    this.memorySignups = new Map();  // ip -> [timestamps]
  }

  get redis() {
    return (this.dataStore && this.dataStore.isRedisConnected && this.dataStore.redis) ? this.dataStore.redis : null;
  }

  _ipKey(ip) {
    return `rl:auth:ip:${ip}`;
  }

  _userKey(usernameLower) {
    return `rl:auth:user:${usernameLower}`;
  }

  _ipCooldownKey(ip) {
    return `rl:auth:cooldown:ip:${ip}`;
  }

  _userCooldownKey(usernameLower) {
    return `rl:auth:cooldown:user:${usernameLower}`;
  }

  _signupIpKey(ip) {
    return `rl:signup:ip:${ip}`;
  }

  // Calculate exponential growing cooldown:
  // 5 failures -> 30s, 6 failures -> 60s, 7 failures -> 120s, 8 failures -> 240s, max 3600s
  _calculateCooldown(fails) {
    if (fails < 5) return 0;
    const over = fails - 5;
    return Math.min(3600, Math.round(30 * Math.pow(2, over)));
  }

  // Check login rate limit for IP and username
  async checkLoginRateLimit(ip, usernameLower) {
    const now = Date.now();

    // 1. Redis Check
    if (this.redis) {
      try {
        const ipCooldownTtl = await this.redis.ttl(this._ipCooldownKey(ip));
        if (ipCooldownTtl > 0) {
          return { allowed: false, retryAfter: ipCooldownTtl };
        }

        if (usernameLower) {
          const userCooldownTtl = await this.redis.ttl(this._userCooldownKey(usernameLower));
          if (userCooldownTtl > 0) {
            return { allowed: false, retryAfter: userCooldownTtl };
          }
        }

        return { allowed: true, retryAfter: 0 };
      } catch (err) {
        // Fall back to memory
      }
    }

    // 2. Memory Fallback Check
    const ipRecord = this.memoryFailures.get(this._ipKey(ip));
    if (ipRecord && ipRecord.cooldownUntil > now) {
      const remaining = Math.max(1, Math.ceil((ipRecord.cooldownUntil - now) / 1000));
      return { allowed: false, retryAfter: remaining };
    }

    if (usernameLower) {
      const userRecord = this.memoryFailures.get(this._userKey(usernameLower));
      if (userRecord && userRecord.cooldownUntil > now) {
        const remaining = Math.max(1, Math.ceil((userRecord.cooldownUntil - now) / 1000));
        return { allowed: false, retryAfter: remaining };
      }
    }

    return { allowed: true, retryAfter: 0 };
  }

  // Record failed login attempt
  async recordLoginFailure(ip, usernameLower) {
    const now = Date.now();

    // 1. Redis
    if (this.redis) {
      try {
        const ipKey = this._ipKey(ip);
        const ipFails = await this.redis.incr(ipKey);
        if (ipFails === 1) await this.redis.expire(ipKey, 900); // 15 min sliding window

        const ipCooldown = this._calculateCooldown(ipFails);
        if (ipCooldown > 0) {
          await this.redis.set(this._ipCooldownKey(ip), '1', 'EX', ipCooldown);
        }

        if (usernameLower) {
          const userKey = this._userKey(usernameLower);
          const userFails = await this.redis.incr(userKey);
          if (userFails === 1) await this.redis.expire(userKey, 900);

          const userCooldown = this._calculateCooldown(userFails);
          if (userCooldown > 0) {
            await this.redis.set(this._userCooldownKey(usernameLower), '1', 'EX', userCooldown);
          }
        }
        return;
      } catch (err) {
        // Fall back to memory
      }
    }

    // 2. Memory Fallback
    const ipRecord = this.memoryFailures.get(this._ipKey(ip)) || { count: 0, cooldownUntil: 0 };
    ipRecord.count += 1;
    const ipCooldownSec = this._calculateCooldown(ipRecord.count);
    if (ipCooldownSec > 0) {
      ipRecord.cooldownUntil = now + ipCooldownSec * 1000;
    }
    this.memoryFailures.set(this._ipKey(ip), ipRecord);

    if (usernameLower) {
      const userRecord = this.memoryFailures.get(this._userKey(usernameLower)) || { count: 0, cooldownUntil: 0 };
      userRecord.count += 1;
      const userCooldownSec = this._calculateCooldown(userRecord.count);
      if (userCooldownSec > 0) {
        userRecord.cooldownUntil = now + userCooldownSec * 1000;
      }
      this.memoryFailures.set(this._userKey(usernameLower), userRecord);
    }
  }

  // Clear failed attempts upon successful login
  async clearLoginFailures(ip, usernameLower) {
    if (this.redis) {
      try {
        await this.redis.del(this._ipKey(ip));
        await this.redis.del(this._ipCooldownKey(ip));
        if (usernameLower) {
          await this.redis.del(this._userKey(usernameLower));
          await this.redis.del(this._userCooldownKey(usernameLower));
        }
        return;
      } catch (err) {}
    }

    this.memoryFailures.delete(this._ipKey(ip));
    if (usernameLower) {
      this.memoryFailures.delete(this._userKey(usernameLower));
    }
  }

  // Rate-limit signups per IP (e.g. max 5 signups per 10 minutes)
  async checkSignupRateLimit(ip) {
    const now = Date.now();
    const SIGNUP_WINDOW = 600; // 10 minutes
    const MAX_SIGNUPS = 5;

    if (this.redis) {
      try {
        const key = this._signupIpKey(ip);
        const count = await this.redis.get(key);
        if (count && parseInt(count, 10) >= MAX_SIGNUPS) {
          const ttl = await this.redis.ttl(key);
          return { allowed: false, retryAfter: Math.max(1, ttl) };
        }
        return { allowed: true, retryAfter: 0 };
      } catch (err) {}
    }

    const list = this.memorySignups.get(ip) || [];
    const valid = list.filter(ts => (now - ts) < SIGNUP_WINDOW * 1000);
    this.memorySignups.set(ip, valid);

    if (valid.length >= MAX_SIGNUPS) {
      const oldest = valid[0];
      const remaining = Math.max(1, Math.ceil((oldest + (SIGNUP_WINDOW * 1000) - now) / 1000));
      return { allowed: false, retryAfter: remaining };
    }

    return { allowed: true, retryAfter: 0 };
  }

  async recordSignup(ip) {
    const SIGNUP_WINDOW = 600;

    if (this.redis) {
      try {
        const key = this._signupIpKey(ip);
        const count = await this.redis.incr(key);
        if (count === 1) {
          await this.redis.expire(key, SIGNUP_WINDOW);
        }
        return;
      } catch (err) {}
    }

    const list = this.memorySignups.get(ip) || [];
    list.push(Date.now());
    this.memorySignups.set(ip, list);
  }
}
