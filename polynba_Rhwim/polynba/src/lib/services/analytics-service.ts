/**
 * Analytics Service
 * 负责预测记录的存储、结算和性能分析
 */

import redis from '@/lib/db/redis';
import { PredictionRecord, ModelPerformance, CalibrationData } from '@/types/analytics';
import { logger } from '@/lib/utils/logger';

export class AnalyticsService {
  /**
   * 保存预测记录
   */
  async savePrediction(record: PredictionRecord): Promise<void> {
    try {
      const key = `prediction:${record.marketId}`;

      // 1. 存储完整记录（30天过期）
      await redis.setex(key, 30 * 24 * 60 * 60, JSON.stringify(record));

      // 2. 添加到时间序列索引
      await redis.zadd('predictions:timeline', record.timestamp, record.marketId);

      // 3. 添加到待结算队列
      await redis.sadd('predictions:pending', record.marketId);

      logger.success(`Saved prediction: ${record.teamA} vs ${record.teamB}`, {
        marketId: record.marketId,
        predictedProb: record.predictedProbabilityA.toFixed(3),
      });
    } catch (error) {
      logger.error('Failed to save prediction', error);
      throw error;
    }
  }

  /**
   * 更新比赛结果
   * 修复：增加基于策略的 ROI 计算逻辑，解决收益虚高问题
   */
  async updateResult(
    marketId: string,
    winner: 'teamA' | 'teamB',
    scoreA: number,
    scoreB: number
  ): Promise<void> {
    try {
      const key = `prediction:${marketId}`;
      const recordStr = await redis.get(key);

      if (!recordStr) {
        logger.warn(`No prediction found for ${marketId}`);
        return;
      }

      const record: PredictionRecord = JSON.parse(recordStr);

      // 1. 基础结果更新
      const actual = winner === 'teamA' ? 1 : 0;
      const predicted = record.predictedProbabilityA;

      record.actualWinner = winner;
      record.actualScoreA = scoreA;
      record.actualScoreB = scoreB;
      record.resultUpdatedAt = Date.now();
      
      // 判断预测是否正确（>50% 视为预测 A 赢）
      record.predictionCorrect = winner === 'teamA' ? predicted > 0.5 : predicted < 0.5;

      // 2. 计算科学指标
      // Brier Score: (predicted - actual)^2
      record.brierScore = Math.pow(predicted - actual, 2);
      
      // Log Loss: -log(predicted_prob_of_actual_outcome)
      const probOfActual = winner === 'teamA' ? predicted : 1 - predicted;
      record.logLoss = -Math.log(Math.max(probOfActual, 0.0001)); // 防止 log(0)

      // 3. 💰 ROI (投资回报率) 核心修复逻辑
      // 只有当模型认为有价值（差异 > 5%）时才下注，否则不计入 ROI (视为观望)
      const EDGE_THRESHOLD = 0.05; // 5% 优势阈值
      const diff = record.predictedProbabilityA - record.marketOddsA;

      let profit = 0; // 默认不亏不赚 (观望)

      if (diff > EDGE_THRESHOLD) {
        // 情况 A: 模型看好 Team A (Yes) -> 买入 Yes
        // 逻辑：认为 Team A 赢的概率比市场高
        if (winner === 'teamA') {
          // 赢：收益 = (1 / 买入价) - 1
          // 例如：0.4 买入，赢了变 1.0，收益 (1/0.4) - 1 = 1.5 (150%)
          profit = (1 / record.marketOddsA) - 1;
        } else {
          // 输：亏损本金
          profit = -1;
        }
      } else if (diff < -EDGE_THRESHOLD) {
        // 情况 B: 模型看好 Team B (No) -> 买入 No (即卖出 Yes)
        // 逻辑：认为 Team A 赢的概率比市场低（即 Team B 赢的概率高）
        // 注意：Polymarket "No" 的价格通常是 marketOddsB
        if (winner === 'teamB') {
          // 赢：收益 = (1 / 买入价) - 1
          profit = (1 / record.marketOddsB) - 1;
        } else {
          // 输：亏损本金
          profit = -1;
        }
      } else {
        // 情况 C: 没价值 (Diff < 5%)，不下注 (Paper trade ROI = 0)
        profit = 0;
      }

      record.expectedValue = profit;

      // 4. 保存更新后的记录
      await redis.setex(key, 30 * 24 * 60 * 60, JSON.stringify(record));

      // 从待结算队列移除
      await redis.srem('predictions:pending', marketId);

      // 添加到已结算队列
      await redis.zadd('predictions:settled', Date.now(), marketId);

      logger.success(`Updated result: ${record.teamA} ${scoreA}-${scoreB} ${record.teamB}`, {
        winner,
        correct: record.predictionCorrect,
        roi: (profit * 100).toFixed(1) + '%',
      });
    } catch (error) {
      logger.error(`Failed to update result for ${marketId}`, error);
      throw error;
    }
  }

  /**
   * 计算模型整体表现
   */
  async getModelPerformance(days: number = 30): Promise<ModelPerformance> {
    try {
      logger.timeStart('getModelPerformance');

      const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

      // 获取时间范围内的所有已结算预测
      const settledIds = await redis.zrangebyscore('predictions:settled', cutoffTime, '+inf');

      if (settledIds.length === 0) {
        logger.warn('No settled predictions found');
        return this.getEmptyPerformance();
      }

      // 批量获取记录
      const pipeline = redis.pipeline();
      settledIds.forEach(id => pipeline.get(`prediction:${id}`));
      const results = await pipeline.exec();

      if (!results) {
        logger.error('Pipeline execution failed');
        return this.getEmptyPerformance();
      }

      const records: PredictionRecord[] = results
        .filter(r => r && r[1])
        .map(r => JSON.parse(r[1] as string))
        .filter(r => r.actualWinner !== undefined); // 确保有结果

      if (records.length === 0) {
        return this.getEmptyPerformance();
      }

      logger.info(`Analyzing ${records.length} predictions`);

      // ==================== 核心指标 ====================
      const totalPredictions = records.length;
      const correctPredictions = records.filter(r => r.predictionCorrect).length;
      const accuracy = correctPredictions / totalPredictions;

      const avgBrierScore =
        records.reduce((sum, r) => sum + (r.brierScore || 0), 0) / totalPredictions;

      const avgLogLoss = records.reduce((sum, r) => sum + (r.logLoss || 0), 0) / totalPredictions;

      // ==================== 按置信度分组 ====================
      const highConf = records.filter(r => r.confidence > 0.8);
      const medConf = records.filter(r => r.confidence >= 0.6 && r.confidence <= 0.8);
      const lowConf = records.filter(r => r.confidence < 0.6);

      // ==================== 按市场价值分组 ====================
      const strongValue = records.filter(
        r => Math.abs(r.predictedProbabilityA - r.marketOddsA) > 0.1
      );
      const value = records.filter(r => {
        const diff = Math.abs(r.predictedProbabilityA - r.marketOddsA);
        return diff >= 0.05 && diff <= 0.1;
      });
      const fair = records.filter(r => Math.abs(r.predictedProbabilityA - r.marketOddsA) < 0.05);

      // 计算 ROI
      const calcROI = (recs: PredictionRecord[]) => {
        if (recs.length === 0) return 0;
        // 总利润 / 总注数 (假设每场下注 1 单位)
        const totalProfit = recs.reduce((sum, r) => sum + (r.expectedValue || 0), 0);
        return (totalProfit / recs.length) * 100; // 转换为百分比
      };

      const performance: ModelPerformance = {
        totalPredictions,
        accuracy,
        avgBrierScore,
        avgLogLoss,
        calibrationScore: this.calculateCalibration(records),
        byConfidence: {
          high: {
            accuracy: this.calculateAccuracy(highConf),
            count: highConf.length,
          },
          medium: {
            accuracy: this.calculateAccuracy(medConf),
            count: medConf.length,
          },
          low: {
            accuracy: this.calculateAccuracy(lowConf),
            count: lowConf.length,
          },
        },
        byValue: {
          strongValue: { roi: calcROI(strongValue), count: strongValue.length },
          value: { roi: calcROI(value), count: value.length },
          fair: { roi: calcROI(fair), count: fair.length },
        },
        last7Days: this.getTimeSeriesData(records, 7),
        last30Days: this.getTimeSeriesData(records, 30),
      };

      logger.timeEnd('getModelPerformance');
      logger.success('Model performance calculated', {
        accuracy: `${(accuracy * 100).toFixed(1)}%`,
        brierScore: avgBrierScore.toFixed(3),
      });

      return performance;
    } catch (error) {
      logger.error('Failed to calculate model performance', error);
      return this.getEmptyPerformance();
    }
  }

  /**
   * 计算准确率
   */
  private calculateAccuracy(records: PredictionRecord[]): number {
    if (records.length === 0) return 0;
    const correct = records.filter(r => r.predictionCorrect).length;
    return correct / records.length;
  }

  /**
   * 计算校准分数
   * 衡量预测概率与实际结果的一致性
   */
  private calculateCalibration(records: PredictionRecord[]): number {
    const bins = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    let totalError = 0;
    let validBins = 0;

    for (let i = 0; i < bins.length - 1; i++) {
      const min = bins[i];
      const max = bins[i + 1];

      const binRecords = records.filter(
        r => r.predictedProbabilityA >= min && r.predictedProbabilityA < max
      );

      if (binRecords.length < 5) continue; // 样本太少跳过

      const avgPredicted =
        binRecords.reduce((sum, r) => sum + r.predictedProbabilityA, 0) / binRecords.length;

      const actualWinRate =
        binRecords.filter(r => r.actualWinner === 'teamA').length / binRecords.length;

      totalError += Math.abs(avgPredicted - actualWinRate);
      validBins++;
    }

    // 返回校准分数 (越接近 1 越好)
    return validBins > 0 ? 1 - totalError / validBins : 0.5;
  }

  /**
/**
   * 生成时间序列数据 (修复版：使用自然日分割)
   */
  private getTimeSeriesData(
    records: PredictionRecord[],
    days: number
  ): { date: string; accuracy: number; count: number }[] {
    const result: { date: string; accuracy: number; count: number }[] = [];
    
    // 1. 获取"今天"的 0点0分0秒 (使用 UTC 以保持一致性，或者使用服务器本地时间)
    // 这里推荐使用 UTC，因为 new Date().toISOString() 也是 UTC
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    
    // 2. 从过去往前推
    for (let i = days - 1; i >= 0; i--) {
      // 计算当天的开始时间 (00:00:00 UTC)
      const currentDayStart = new Date(todayStart);
      currentDayStart.setUTCDate(todayStart.getUTCDate() - i);
      
      // 计算当天的结束时间 (下一天 00:00:00 UTC)
      const currentDayEnd = new Date(currentDayStart);
      currentDayEnd.setUTCDate(currentDayStart.getUTCDate() + 1);

      const startTime = currentDayStart.getTime();
      const endTime = currentDayEnd.getTime();

      // 3. 筛选该自然日内的记录
      const dayRecords = records.filter(r => r.timestamp >= startTime && r.timestamp < endTime);

      const dateLabel = currentDayStart.toISOString().split('T')[0];

      if (dayRecords.length === 0) {
        result.push({
          date: dateLabel,
          accuracy: 0,
          count: 0,
        });
        continue;
      }

      const dayAccuracy = this.calculateAccuracy(dayRecords);

      result.push({
        date: dateLabel,
        accuracy: dayAccuracy,
        count: dayRecords.length,
      });
    }

    return result;
  }

  /**
   * 获取空白的性能对象
   */
  private getEmptyPerformance(): ModelPerformance {
    return {
      totalPredictions: 0,
      accuracy: 0,
      avgBrierScore: 0,
      avgLogLoss: 0,
      calibrationScore: 0,
      byConfidence: {
        high: { accuracy: 0, count: 0 },
        medium: { accuracy: 0, count: 0 },
        low: { accuracy: 0, count: 0 },
      },
      byValue: {
        strongValue: { roi: 0, count: 0 },
        value: { roi: 0, count: 0 },
        fair: { roi: 0, count: 0 },
      },
      last7Days: [],
      last30Days: [],
    };
  }

  /**
   * 获取待结算的预测数量
   */
  async getPendingCount(): Promise<number> {
    try {
      const count = await redis.scard('predictions:pending');
      return count;
    } catch (error) {
      logger.error('Failed to get pending count', error);
      return 0;
    }
  }

  /**
   * 获取已结算的预测数量
   */
  async getSettledCount(days: number = 30): Promise<number> {
    try {
      const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
      const count = await redis.zcount('predictions:settled', cutoffTime, '+inf');
      return count;
    } catch (error) {
      logger.error('Failed to get settled count', error);
      return 0;
    }
  }

  /**
   * 生成校准表数据（用于更新 CALIBRATION_TABLE）
   */
  async generateCalibrationTable(): Promise<CalibrationData[]> {
    try {
      const cutoffTime = Date.now() - 90 * 24 * 60 * 60 * 1000; // 过去90天
      const settledIds = await redis.zrangebyscore('predictions:settled', cutoffTime, '+inf');

      if (settledIds.length === 0) {
        logger.warn('No settled predictions for calibration');
        return [];
      }

      const pipeline = redis.pipeline();
      settledIds.forEach(id => pipeline.get(`prediction:${id}`));
      const results = await pipeline.exec();

      if (!results) return [];

      const records: PredictionRecord[] = results
        .filter(r => r && r[1])
        .map(r => JSON.parse(r[1] as string))
        .filter(r => r.actualWinner !== undefined);

      // 按概率区间分组
      const bins = [
        [0.0, 0.4],
        [0.4, 0.5],
        [0.5, 0.6],
        [0.6, 0.7],
        [0.7, 1.0],
      ];

      const calibrationTable: CalibrationData[] = bins.map(([min, max]) => {
        const binRecords = records.filter(
          r => r.predictedProbabilityA >= min && r.predictedProbabilityA < max
        );

        const actualWinRate =
          binRecords.length > 0
            ? binRecords.filter(r => r.actualWinner === 'teamA').length / binRecords.length
            : 0.5;

        return {
          predictedRange: [min, max] as [number, number],
          actualWinRate,
          sampleSize: binRecords.length,
        };
      });

      logger.success('Calibration table generated', { bins: calibrationTable.length });

      return calibrationTable;
    } catch (error) {
      logger.error('Failed to generate calibration table', error);
      return [];
    }
  }
}

// 导出单例
export const analyticsService = new AnalyticsService();