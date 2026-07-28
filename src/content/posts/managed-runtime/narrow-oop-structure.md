---
title: "How does Narrow OOP structure look like"
pubDatetime: 2025-11-20T21:59:18+08:00
description: "在 64 bit 平台上一个 oop 指针占用 8 bytes 的大小，在 Java 堆中各种地方都塞满了 OOP 指针，如果大家都是 8 bytes 那占用的大小就比较大。所以 64 bit 平台上 JVM 使用了压缩指针技术 Compressed OOP。它引入了一种窄指针..."
tags:
  - managed-runtime
---

在 64 bit 平台上一个 oop 指针占用 8 bytes 的大小，在 Java 堆中各种地方都塞满了 OOP 指针，如果大家都是 8 bytes 那占用的大小就比较大。所以 64 bit 平台上 JVM 使用了压缩指针技术 Compressed OOP。它引入了一种窄指针 `narrowOop`，能够在堆大小满足一定要求时采用 32 bits (4 bytes) 表示一个 oop 指针。

有多种 Narrow OOP encoding mode。

## 0 - no encoding
在 `NarrowOopHeapBaseMin + 堆大小` < 4GB 时，指针天然可以用 32 bits 表示，此时不需要任何编码，直接将 `oop` 强转为 `uint32_t` 表示即可。但这意味着原本 64 bits 上高 16 bits 的空闲空间是不存在的，因为都截断了。

## 1 - zero based compressed oops
在 `NarrowOopHeapBaseMin + 堆大小` < 32GB，采用这种压缩方式。
```Cpp
// ObjectAlignmentInBytes = 8 by default
// So LogMinObjAlignmentInBytes = 3 by default
LogMinObjAlignmentInBytes  = exact_log2(ObjectAlignmentInBytes);

// Maximal size of heap where unscaled compression can be used. Also upper bound
// for heap placement: 4GB.
const  uint64_t UnscaledOopHeapMax = (uint64_t(max_juint) + 1);

  if ((uint64_t)heap_space.end() > UnscaledOopHeapMax) {
    // Didn't reserve heap below 4Gb.  Must shift.
    set_shift(LogMinObjAlignmentInBytes);
  }
```

set_shift 为 3，即当 `NarrowOopHeapBaseMin + 堆大小` 超过了 4GB，那么利用对象是 8 Bytes 对齐的特性就很重要，这可以省下 3 bits 的空间。

```Cpp
  if ((uint64_t)heap_space.end() <= OopEncodingHeapMax) {
    // Did reserve heap below 32Gb. Can use base == 0;
    set_base(0);
  } else {
    set_base((address)heap_space.compressed_oop_base());
  }
```

如果 `NarrowOopHeapBaseMin + 堆大小` 没超过 32GB 那么 base 就是 0，否则就需要有一个 heap base 作减法以保证结果能放到 32 bits 中。

## 2/3 - heap based compressed oops
如上，超过 32GB 就需要减。

## Algorithm
```Cpp
inline narrowOop CompressedOops::encode_not_null(oop v) {
  assert(!is_null(v), "oop value can never be zero");
  assert(is_object_aligned(v), "address not aligned: " PTR_FORMAT, p2i(v));
  assert(is_in(v), "address not in heap range: " PTR_FORMAT, p2i(v));
  uint64_t  pd = (uint64_t)(pointer_delta((void*)v, (void*)base(), 1));
  assert(OopEncodingHeapMax > pd, "change encoding max if new encoding");
  narrowOop result = narrow_oop_cast(pd >> shift());
  assert(decode_raw(result) == v, "reversibility");
  return result;
}
```
`(pointer - base) >> shift`。所以只要 OOP 指针可能的取值上下限不超过 32GB，那么就可以放到一个 narrowOop 中。
