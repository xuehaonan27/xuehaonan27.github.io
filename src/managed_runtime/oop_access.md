# OOP access logic in OpenJDK 21 Hotspot JVM

Cause there's not much material telling me about how OOP access is implemented (apart from comments in OpenJDK Hotspot C++ code), I am going to analyze how OOP access implementation detail.

**NOTE**: implementation detail, not brief summary.

涉及到的文件列表如下
```plaintext
jdk21u/src/hotspot/share/oops/access.hpp
jdk21u/src/hotspot/share/oops/access.inline.hpp
jdk21u/src/hotspot/share/oops/accessBackend.hpp
jdk21u/src/hotspot/share/oops/accessBackend.inline.hpp
jdk21u/src/hotspot/share/oops/accessBackend.cpp
jdk21u/src/hotspot/share/oops/accessDecorators.hpp
```

## OOP Access Operations
**load**: 从某一个地址加载值。

**load_at**: 给出基地址(base)和偏移量(offset)从这里加载一个值。

**store**: 存储一个值到某一地址。

**store_at**: 给出基地址(base)和偏移量(offset)向这里存储一个值。

**atomic_cmpxchg**: 对某一地址的值原子的 CAS 操作。

**atomic_cpmxchg_at**: 给出基地址(base)和偏移量(offset)对此处的值进行原子的 CAS 操作。

**atomic_xchg**: 对某一地址的值原子地进行交换。

**atomic_xchg_at**: 给出基地址(base)和偏移量(offset)对此处的值进行原子的交换。

## OOP Access Decorators
对 OOP 的访问通过一系列 `Decorators`（装饰器）去附加语义。这里给它们做一个分类。

文件：`src/hotspot/share/oops/accessDecorators.hpp`

```Cpp
typedef uint64_t DecoratorSet;

template <DecoratorSet decorators, DecoratorSet decorator>
struct HasDecorator: public std::integral_constant<bool, (decorators & decorator) != 0> {};
```
`DecoratorSet` 为 64bit 宽的整数。`HasDecorator` 这个结构比较重要，它通过静态地将 `decorator` 与 `decorators` 做与运算来获取一个 bool 值来指导模板特化和 SFINAE 。

- General Decorators
  - `DECORATORS_NONE`: 全 0 值，表示空的装饰器集合，是默认值。
- Internal Decorators
  - `INTERNAL_CONVERT_COMPRESSED_OOP`: 在启用了 UseCompressedOops 选项时，64 bit的 JVM 可以将 64 位宽度的 oop 指针压缩为 32 位宽度的 narrowOop 指针。当装饰器集合中有这个装饰器时，表示本次 oop access 需要在 oop 和 narrowOop 之间转换。
  - `INTERNAL_VALUE_IS_OOP`: 表示本次访问是 oop 访问，不是基本类型访问。
- Internal run-time Decorators
  - `INTERNAL_RT_USE_COMPRESSED_OOPS`: 当启用了 UseCompressedOops 选项时，该装饰器站在运行时解析的访问中会被设置（即需要 Runtime-dispatch 的访问）。
- Memory Ordering Decorators
  - `MO_UNORDERED`: 没有任何内存序保证，编译器和硬件可以以任何形式重排指令。
  - `MO_RELAXED`: 表示原子的 load / store，编译器不重排该指令，但是硬件有可能重排。
  - `MO_ACQUIRE`:
  - `MO_RELEASE`:
  - `MO_SEQ_CST`:
- Barrier Strength Decorators
  - `AS_RAW`: 该访问会被解释为裸的内存访问。忽略所有的语义（除了内存序和压缩oop指针）。绕过运行时函数指针分发（从预运行时分发就出去了，不再继续走流水线），所以也不会经过 GC 屏障。一般用在 JVM 内部对对象的访问中。
    - 对 `oop*` 的访问会被解释为裸内存访问，不经过运行时检查。
    - 对 `narrowOop*` 的访问会被解释为 encoded / decoded 内存访问（涉及到指针变换），不经过运行时检查。
    - 对 `HeapWord*` 的访问会经过运行时检查，并且选择使用 `oop*` 访问或者 `narrowOop*` 访问。
    - 对其他类型的访问会解释为裸内存访问，不经过运行时检查。
  - `AS_NO_KEEPALIVE`: 该次访问不会将目标对象保活。即在例如 ZGC 这种全并发 GC 算法中，Mutator 对对象的访问会通过 load barrier 将其标记为活对象（并且做指针自愈，指针染色转换等）；或者通过 Reference 类型访问对象，这样的 access 就是保活的 (keepalive)。而加上了 `AS_NO_KEEPALIVE` 则表示该次访问不保活。但是访问会尊重例如 ZGC 中的并发驱逐、维护跨分代或者跨 Region 的指针。
  - `AS_NORMAL`: 本次访问会被解析到一个 `BarrierSet` 类（具体是哪个子类取决于 GC 算法）的 accessor 上。注意对于基本类型的访问，只有合适的 build-time 装饰器被设置时，对基本类型的访问才会被解析到 `BarrierSet` 上，否则应该是一次裸内存访问。
- Reference Strength Decorators
  - `ON_STRONG_OOP_REF`: 访问 strongly reachable reference。
  - `ON_WEAK_OOP_REF`: 访问 weakly reachable reference。
  - `ON_PHANTOM_OOP_REF`: 访问 phantomly reachable reference。
  - `ON_UNKNOWN_OOP_REF`: 不知道引用强度时。这个应用场景通常是在 unsafe API 中，从没有信息的地方传入一个不知道强度的引用。
- Access Location
  - `IN_HEAP`: 访问发生在 Java 堆内。如果 `IN_HEAP` 不设置的话，那么很多针对 Java 堆内对象的操作就不必要了，比如 G1 GC 维护卡表的行为。
  - `IN_NATIVE`: 访问是在 Java 堆外的结构上发生的。基本就是本地堆了。
  - `IN_NMETHOD`: 访问发生在一个 nmethod 上。
- Boolean Flag Decorators
  - `IS_ARRAY`: 访问发生在一个在 Java 堆上分配内存的 array 上。对于某些 GC 来说处理 oop 和处理 array 行为有所区别，对于这样的 GC，设置该装饰器就有必要。
  - `IS_DEST_UNINITIALIZED`: 表示访问的值是未初始化的，比如对于 G1 GC 的 SATB 写屏障来说，被写掉的前值有可能根本就不是一个值，即那个引用就是个未初始化的状态，所以在写屏障拦截到这个写的时候，有可能就不用对前值做一些额外的操作和维护了（比如维护卡表和 Remember Set）。
  - `IS_NOT_NULL`: 加速某些操作，比如 compress oop 的时候，如果能知道这个 oop 一定是非空的，那可以省下几个计算。
- Arraycopy Decorators
  - `ARRAYCOPY_CHECKCAST`: 复制时，如果能保证src array 的元素的类是 dst array 的元素的类的子类，那这种情况就比较好，就不需要设置 `ARRAYCOPY_CHECKCAST`。但是如果不能保证，就要设置这个装饰器，在复制操作时插一个 check-cast barrier 进去做类型检查。
  - `ARRAYCOPY_DISJOINT`: 表示 src array 和 dst array 能保证范围是不重合的。
  - `ARRAYCOPY_ARRAYOF`: 该复制时 arrayof 形式的。
  - `ARRAYCOPY_ATOMIC`: 访问需要是原子的 (over the size of its elements)。
  - `ARRAYCOOPY_ALIGNED`: 访问需要与 HeapWord 对齐（8字节对齐）。
- Resolve barrier decorators
  - `ACCESS_READ`: 访问的目标对象是以 read-only 形式访问的。可以让 GC backend 使用更弱更高效的 barriers。
  - `ACCESS_WRITE`: 访问的目标对象以 write 形式访问。
- `DECORATOR_LAST`: 表示最后一个装饰器在哪里（最高bit在哪里）。

`template<DecoratorSet input_decorators> struct DecoratorFixup: AllStatic` 用于给 `input_decorators` 中没有设置装饰器的装饰器类别上配置默认值：
- `struct const DecoratorSet ref_strength_default`: 如果 reference strength 类别中没设置，默认选择 strong。
- `struct const DecoratorSet memory_ordering_default`: 默认选择 unordered 内存序。
- `struct const DecoratorSet barrier_strength_default`: 默认选择 normal 的 barrier 强度。
- `struct const DecoratorSet value = barrier_strength`: 意味不明。
- `inline DecoratorSet decorator_fixup(DecoratorSet input_decorators, BasicType type)` 是不使用 metaprogramming 和 templates 的方式，即通过运行时函数调用做一样的事情。

## OOP Access Steps
注意 Step 1 - 4 都是静态能够确定的，在编译器就静态派发好了；Step 5.a 存在因为 GC 类型等等信息必须是我们实际跑 JVM 时指定的，所以需要运行时参与；以及实际执行 GC 屏障也是运行时的。
#### Step 1
设置默认装饰器，将类型衰减 (Decay types)，将 const 和 volatile 装饰符去掉。

#### Step 2
类型缩减 (Reduce types)，因为在模板类型中，一个类型 T 和其指针类型 P 是两个 typename，T 和 P 的关系不明确，这一步的作用就是保证 P 是 T 的指针类型。

#### Step 3
预运行时分发(Pre-runtime dispatch)。检查 OOP 访问是否不需要运行时的调用（例如 GC barrier）。例如对于 Raw access 以及对基本类型（非对象）的访问（在 release build 中？），这类访问会直接在这里派发出来，不会继续沿流水线往下走。

#### Step 4
运行时分发(Runtime-dispatch)，这一步主要是对 OOP 的访问，会委托给 GC 特定的访问屏障， 根据 BarrierSet::AccessBarrier 去添加一个 GC barrier。

#### Step 5.a
屏障解析。这一步应该是 Runtime-dispatch 首次发生时执行以下，起到一个初始化的作用。即对于 Step 4 运行时分发来说，顾名思义，在运行时才能获知具体要使用哪一个 GC，采用哪一个函数来派发，所以需要运行时一次初始化，在此之后就不需要了。

#### Step 5.b
后运行时派发 (Post-runtime dispatch)。

## access.hpp
该文件主要定义了：
```Cpp
template <DecoratorSet decorators = DECORATORS_NONE>
class Access: public AllStatic;

// Helper for performing raw accesses (knows only of memory ordering
// atomicity decorators as well as compressed oops).
template <DecoratorSet decorators = DECORATORS_NONE>
class RawAccess: public Access<AS_RAW | decorators> {};

// Helper for performing normal accesses on the heap. These accesses
// may resolve an accessor on a GC barrier set.
template <DecoratorSet decorators = DECORATORS_NONE>
class HeapAccess: public Access<IN_HEAP | decorators> {};

// Helper for performing normal accesses in roots. These accesses
// may resolve an accessor on a GC barrier set.
template <DecoratorSet decorators = DECORATORS_NONE>
class NativeAccess: public Access<IN_NATIVE | decorators> {};

// Helper for performing accesses in nmethods. These accesses
// may resolve an accessor on a GC barrier set.
template <DecoratorSet decorators = DECORATORS_NONE>
class NMethodAccess: public Access<IN_NMETHOD | decorators> {};

// Helper for array access.
template <DecoratorSet decorators = DECORATORS_NONE>
class ArrayAccess: public HeapAccess<IS_ARRAY | decorators>;
```

可以看到 access.hpp 中就是定义了一个 `Class Access`，其他的类都是 `Access` 预置了一个“访问来源”装饰器并作别名。所以接下来分析 `Class Access` 的具体实现。

### verify_decorators
```Cpp
template <DecoratorSet decorators>
template <DecoratorSet expected_decorators>
void Access<decorators>::verify_decorators();
```
检查 `Access` 携带的装饰器是否合法。
1. 不能有非法 bit。
2. 某一类装饰器内部是互斥的，同一类中不可以同时设置多个。

**阻止非法bit**

该函数中 `decorators` 泛型参数是 `Class Access` 类型标签中的，代表该访问所携带的装饰器标签有哪些。 `expected_decorators` 涵盖了 Hotspot JVM 内置的所有装饰器标签。它的作用就是防止 `decorators` 中存在非法 bit，即实现的第一行：
```Cpp
STATIC_ASSERT((~expected_decorators & decorators) == 0); // unexpected decorator used
```
注意到使用了 `STATIC_ASSERT` 即是在编译器完成的。

**屏障强度装饰器**
```Cpp
const DecoratorSet barrier_strength_decorators = decorators & AS_DECORATOR_MASK;
STATIC_ASSERT(barrier_strength_decorators == 0 || ( // make sure barrier strength decorators are disjoint if set
  (barrier_strength_decorators ^ AS_NO_KEEPALIVE) == 0 ||
  (barrier_strength_decorators ^ AS_RAW) == 0 ||
  (barrier_strength_decorators ^ AS_NORMAL) == 0
));
```

屏障强度装饰器有三类，`AS_NO_KEEPALIVE`，`AS_RAW`，`AS_NORMAL`。这个 STATIC_ASSERT 可以确保要么都不设置，要么只设置了其中一个。如果同时设置了多个，那么所有的异或操作都不会为0，该 STATIC_ASSERT 就会失效。

**引用强度装饰器**
```Cpp
const DecoratorSet ref_strength_decorators = decorators & ON_DECORATOR_MASK;
STATIC_ASSERT(ref_strength_decorators == 0 || ( // make sure ref strength decorators are disjoint if set
  (ref_strength_decorators ^ ON_STRONG_OOP_REF) == 0 ||
  (ref_strength_decorators ^ ON_WEAK_OOP_REF) == 0 ||
  (ref_strength_decorators ^ ON_PHANTOM_OOP_REF) == 0 ||
  (ref_strength_decorators ^ ON_UNKNOWN_OOP_REF) == 0
));
```
同理。引用强度是指 Java 语言中 `java.lang.Reference` 里面所定义的四种引用类型的不同强度。在这类只有强引用，弱引用，虚引用以及不知名的引用，并没有包括轻引用。也是只能有一个设置。

**内存序装饰器**
```Cpp
const DecoratorSet memory_ordering_decorators = decorators & MO_DECORATOR_MASK;
STATIC_ASSERT(memory_ordering_decorators == 0 || ( // make sure memory ordering decorators are disjoint if set
  (memory_ordering_decorators ^ MO_UNORDERED) == 0 ||
  (memory_ordering_decorators ^ MO_RELAXED) == 0 ||
  (memory_ordering_decorators ^ MO_ACQUIRE) == 0 ||
  (memory_ordering_decorators ^ MO_RELEASE) == 0 ||
  (memory_ordering_decorators ^ MO_SEQ_CST) == 0
));
```

对于原子操作来说需要有内存序，该类装饰器确定了本次内存访问是否应该使用原子操作，如果是，那应该使用什么样子的内存序。

**访问位置装饰器**
```Cpp
const DecoratorSet location_decorators = decorators & IN_DECORATOR_MASK;
STATIC_ASSERT(location_decorators == 0 || ( // make sure location decorators are disjoint if set
  (location_decorators ^ IN_NATIVE) == 0 ||
  (location_decorators ^ IN_NMETHOD) == 0 ||
  (location_decorators ^ IN_HEAP) == 0
));
```

这类装饰器确定了本次访问位于哪里。分三类，`IN_NATIVE` 表示访问在本地内存中；`IN_NMETHOD` 表示访问在 Java 方法中，因为 Java 方法中是存在一系列槽去放值的，部分值甚至对象会放在方法栈上（比较老的 JVM 则不会放对象在栈上）；`IN_HEAP` 表示访问在 Java 堆中。

### verify_primitive_decorators
```Cpp
template <DecoratorSet expected_mo_decorators>
static void verify_primitive_decorators() {
  const DecoratorSet primitive_decorators = (AS_DECORATOR_MASK ^ AS_NO_KEEPALIVE) |
                                            IN_HEAP | IS_ARRAY;
  verify_decorators<expected_mo_decorators | primitive_decorators>();
}
```

在 `AS_DECORATOR_MASK` 去掉 `AS_NO_KEEPALIVE`，即 `primitive_decorators` 实际上为 `AS_RAW | AS_NORMAL | IN_HEAP | IS_ARRAY`。

### verify_oop_decorators verify_heap_oop_decorators
```Cpp
  template <DecoratorSet expected_mo_decorators>
  static void verify_oop_decorators() {
    const DecoratorSet oop_decorators = AS_DECORATOR_MASK | IN_DECORATOR_MASK |
                                        (ON_DECORATOR_MASK ^ ON_UNKNOWN_OOP_REF) | // no unknown oop refs outside of the heap
                                        IS_ARRAY | IS_NOT_NULL | IS_DEST_UNINITIALIZED;
    verify_decorators<expected_mo_decorators | oop_decorators>();
  }

  template <DecoratorSet expected_mo_decorators>
  static void verify_heap_oop_decorators() {
    const DecoratorSet heap_oop_decorators = AS_DECORATOR_MASK | ON_DECORATOR_MASK |
                                             IN_HEAP | IS_ARRAY | IS_NOT_NULL | IS_DEST_UNINITIALIZED;
    verify_decorators<expected_mo_decorators | heap_oop_decorators>();
  }
```

注意到 `heap_oop_decorators` 就是 `oop_decorators` 之外额外允许了 `ON_UNKNOWN_OOP_REF`，即堆中是可以用 unknown oop refs，而在 Java 堆外是不允许有这样的。

### Special Decorator Set
```Cpp
  static const DecoratorSet load_mo_decorators = MO_UNORDERED | MO_RELAXED | MO_ACQUIRE | MO_SEQ_CST;
  static const DecoratorSet store_mo_decorators = MO_UNORDERED | MO_RELAXED | MO_RELEASE | MO_SEQ_CST;
  static const DecoratorSet atomic_xchg_mo_decorators = MO_SEQ_CST;
  static const DecoratorSet atomic_cmpxchg_mo_decorators = MO_RELAXED | MO_SEQ_CST;
```
额外预置了一些装饰集合。`load` 操作一般不需要 release，而 `store` 操作一般不需要 acquire。对于 `atomic_xchg` 一般必须是最强的 sequential consistent 的，而 `atomic_cmpxchg` 则额外允许了 relaxed 语义。这些都符合一般的原子操作的原则。

## accessBackend.hpp
该文件以及关联的 accessBackend.inline.hpp 以及 accessBackend.cpp 实现了 Step 1 - 4。

### HeapOopType
```Cpp
// This metafunction returns either oop or narrowOop depending on whether
// an access needs to use compressed oops or not.
template <DecoratorSet decorators>
struct HeapOopType: AllStatic {
  static const bool needs_oop_compress = HasDecorator<decorators, INTERNAL_CONVERT_COMPRESSED_OOP>::value &&
                                         HasDecorator<decorators, INTERNAL_RT_USE_COMPRESSED_OOPS>::value;
  using type = std::conditional_t<needs_oop_compress, narrowOop, oop>;
};
```
这是一个 metafunction，传入 `DecoratorSet decorators`，检查 decorators 中是否设置了`INTERNAL_CONVERT_COMPRESSED_OOP` 或者 `INTERNAL_RT_USE_COMPRESSED_OOPS`，静态地判断是否需要 oop compress，并且通过 `std::conditional_t` 将返回值结果放在 type 中。

### BarrierType
```Cpp
  enum BarrierType {
    BARRIER_STORE,
    BARRIER_STORE_AT,
    BARRIER_LOAD,
    BARRIER_LOAD_AT,
    BARRIER_ATOMIC_CMPXCHG,
    BARRIER_ATOMIC_CMPXCHG_AT,
    BARRIER_ATOMIC_XCHG,
    BARRIER_ATOMIC_XCHG_AT,
    BARRIER_ARRAYCOPY,
    BARRIER_CLONE
  };
```
一个枚举，表示 barrier 是针对什么 oop operation 的。

### MustConvertCompressedOop
