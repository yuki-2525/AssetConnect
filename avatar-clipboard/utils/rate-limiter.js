class RateLimiter {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 3;
    this.delayBetweenRequests = options.delayBetweenRequests || 500;
    this.delayBetweenBatches = options.delayBetweenBatches || 2000;
    
    this.activeRequests = 0;
    this.requestQueue = [];
    this.requestCount = 0;
    this.completedCount = 0;
  }

  async executeWithRateLimit(requestFunction, context = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        requestFunction,
        context,
        resolve,
        reject
      });
      
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.activeRequests >= this.maxConcurrent || this.requestQueue.length === 0) {
      return;
    }

    const { requestFunction, context, resolve, reject } = this.requestQueue.shift();
    this.activeRequests++;

    try {
      // Execute the request
      const result = await requestFunction(context);
      
      this.completedCount++;
      console.log(`Rate Limiter: Completed ${this.completedCount} requests`);
      
      resolve(result);
      
      // Delay before processing next request
      setTimeout(() => {
        this.activeRequests--;
        this.processQueue();
      }, this.delayBetweenRequests);
      
    } catch (error) {
      this.activeRequests--;
      reject(error);
      
      // Continue processing queue even on error
      setTimeout(() => {
        this.processQueue();
      }, this.delayBetweenRequests);
    }
  }

  getStatus() {
    return {
      activeRequests: this.activeRequests,
      queueLength: this.requestQueue.length,
      completedCount: this.completedCount
    };
  }

  clear() {
    this.requestQueue = [];
    this.activeRequests = 0;
    this.requestCount = 0;
    this.completedCount = 0;
  }
}