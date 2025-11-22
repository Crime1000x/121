/**
 * 日期工具函数
 * 统一处理日期格式化和计算
 */

/**
 * 格式化比赛日期
 * @returns { label: '今天' | '明天' | 'MM/DD', style: CSS类名, time: 'HH:MM' }
 */
export function formatGameDate(dateStr: string | Date): {
  label: string;
  style: string;
  time: string;
  daysDiff: number;
} {
  const gameDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const gameDateOnly = new Date(gameDate);
  gameDateOnly.setHours(0, 0, 0, 0);
  
  // 计算天数差
  const daysDiff = Math.floor(
    (gameDateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  let label = '';
  let style = 'text-slate-500';
  
  if (gameDateOnly.getTime() === today.getTime()) {
    label = '今天';
    style = 'text-blue-400';
  } else if (gameDateOnly.getTime() === tomorrow.getTime()) {
    label = '明天';
    style = 'text-slate-400';
  } else if (daysDiff > 0 && daysDiff <= 7) {
    // 未来一周显示星期几
    label = gameDate.toLocaleDateString('zh-CN', { weekday: 'short' });
    style = 'text-slate-500';
  } else {
    // 其他显示月/日
    label = gameDate.toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
    });
    style = 'text-slate-500';
  }
  
  const time = gameDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  
  return { label, style, time, daysDiff };
}

/**
 * 计算两个日期之间的天数差
 */
export function getDaysDiff(date1: Date | string, date2: Date | string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 检查日期是否在指定范围内
 */
export function isDateInRange(
  date: Date | string,
  startDate: Date | string,
  endDate: Date | string
): boolean {
  const d = new Date(date).getTime();
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  
  return d >= start && d <= end;
}

/**
 * 获取日期的开始时间（00:00:00）
 */
export function getDateStart(date: Date | string): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 获取日期的结束时间（23:59:59）
 */
export function getDateEnd(date: Date | string): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * 格式化为 YYYY-MM-DD
 */
export function formatDateISO(date: Date | string): string {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * 获取相对时间描述
 * @example "2小时前", "3天后"
 */
export function getRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffSec = Math.floor(Math.abs(diffMs) / 1000);
  const isPast = diffMs < 0;
  
  const suffix = isPast ? '前' : '后';
  
  if (diffSec < 60) {
    return `刚刚`;
  } else if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return `${mins}分钟${suffix}`;
  } else if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `${hours}小时${suffix}`;
  } else {
    const days = Math.floor(diffSec / 86400);
    return `${days}天${suffix}`;
  }
}