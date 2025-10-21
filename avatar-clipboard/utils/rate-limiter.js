/**
 * APIリクエストのレート制限を管理するクラス
 * 同時実行数、リクエスト間隔、バッチ間遅延を制御してAPIの過負荷を防ぐ
 */
class RateLimiter {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 3;           // 最大同時実行数
    this.delayBetweenRequests = options.delayBetweenRequests || 500;  // リクエスト間遅延(ミリ秒)
    this.delayBetweenBatches = options.delayBetweenBatches || 2000;   // バッチ間遅延(ミリ秒)
    
    this.activeRequests = 0;    // 現在実行中のリクエスト数
    this.requestQueue = [];     // リクエストキュー
    this.requestCount = 0;      // 総リクエスト数
    this.completedCount = 0;    // 完了リクエスト数
  }

  /**
   * レート制限付きでリクエスト関数を実行する
   * @param {Function} requestFunction - 実行するリクエスト関数
   * @param {Object} context - リクエストのコンテキスト情報
   * @returns {Promise} リクエスト結果のPromise
   */
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
      // リクエストを実行
      const result = await requestFunction(context);
      
      this.completedCount++;
      console.log(`Rate Limiter: Completed ${this.completedCount} requests`);
      
      resolve(result);
      
      // 次のリクエスト処理前の遅延
      setTimeout(() => {
        this.activeRequests--;
        this.processQueue();
      }, this.delayBetweenRequests);
      
    } catch (error) {
      this.activeRequests--;
      reject(error);
      
      // エラーが発生してもキューの処理を継続
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