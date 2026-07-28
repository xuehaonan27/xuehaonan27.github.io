---
title: "OpenJDK 21 Hotspot JVM G1 GC explained"
pubDatetime: 2025-11-14T18:53:16+08:00
description: "G1 GC 的算法原理不赘述，此处专门分析 OpenJDK 21 Hotspot JVM 的 G1 GC 具体实现细节。"
tags:
  - managed-runtime
---

G1 GC 的算法原理不赘述，此处专门分析 OpenJDK 21 Hotspot JVM 的 G1 GC 具体实现细节。

## 重要的类
#### G1CollectedHeap

#### G1ConcurrentMark

#### G1YoungCollector

#### G1ParScanThreadState

#### 各种 Closures
Hotspot JVM 采用大量的闭包来派发对每一个对象、堆区域或者线程要执行的动作。
- **Oop Closures**:

- **Region Closures**:

- **Thread Closures**:

### 线程执行模型类
G1 GC 采用大量 GC Workers 并发地执行任务。每一个 Worker 都继承了 Thread 类，后者是 Hotspot JVM 中对操作系统提供的线程模型的平台无关抽象，在 Linux 操作系统下就对应一个 pthread。
- **Threads**: Threads 是诸多 Thread 的集合，在 Hotspot JVM 中具有唯一实例（应该），并且兼具负责各个线程生命周期管理（创建、启动、停止、回收）以及 JVM 本身的启动工作。

- **Thread**: Thread 是 Hotspot JVM 中对操作系统提供的线程模型的平台无关抽象。

- **WorkerThreads**:

- **WorkerThread**:

- **WorkTask**:

- **WorkerTaskDispatcher**:

## 标记过程

## 驱逐过程

## Humongous 对象处理
