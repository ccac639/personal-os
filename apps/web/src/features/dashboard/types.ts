import type { Component } from 'vue';

/** 统计卡片数据 */
export interface StatCard {
  id: string;
  label: string;
  value: number | string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  /** 迷你趋势图数据点 */
  spark?: number[];
  icon: Component;
  color?: string;
}

/** 快速操作项 */
export interface QuickAction {
  id: string;
  label: string;
  icon: Component;
  href: string;
  /** 样式：图标色 + hover 渐变起点色 + 渐变终点色（空格分隔） */
  color: string;
  /** 快捷键提示（右下角显示） */
  shortcut?: string;
}

/** 项目条目 */
export interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'completed';
  lastUpdated: string;
  progress?: number;
}

/** 活动流条目 */
export interface ActivityItem {
  id: string;
  type: 'commit' | 'project' | 'workflow' | 'system';
  title: string;
  description: string;
  timestamp: string;
  icon: Component;
}

/** 系统状态 */
export interface ServiceStatus {
  name: string;
  /** 技术栈（名称下方小字） */
  stack?: string;
  status: 'online' | 'offline' | 'warning';
  latency?: number;
  lastCheck: string;
}
