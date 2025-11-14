# Introduction
This section records develop process of `libstco` (Library for Stackful Coroutine). The project has been made open source and source code could be found [here](https://github.com/xuehaonan27/libstco).

## Background
I wanted to replace JVM's thread model with user space thread (coroutine) and keep API and semantics as close as `pthread`.

## Design
To keep semantics as same as `pthread`, the STCO(Stackful Coroutine) must be **preemptive**. Yes, this might sounds strange, these routines might preempt instead of cooperatively yielding to each other.
