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
- `struct const DecoratorSet value = barrier_strength`: 综合了以上三个默认值，是这个元函数的返回值，即默认装饰器集合。
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

## Basic definitions in access.hpp
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

## Basic definitions in accessBackend.hpp
该文件以及关联的 accessBackend.inline.hpp 以及 accessBackend.cpp 实现了 Step 1 - 4。

先回忆一下 accessDecorators.hpp 中定义的 HasDecorator。
```Cpp
template <DecoratorSet decorators, DecoratorSet decorator>
struct HasDecorator: public std::integral_constant<bool, (decorators & decorator) != 0> {};
```
它是一个元布尔值，传入 `DecoratorSet decorators` 和 `DecoratorSet decorator`，检查 `decorator` 是否在 `decorators` 中，并且将结果值存放在 value 中。

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
这是一个 metafunction，传入 `DecoratorSet decorators`，检查 decorators 中是否设置了`INTERNAL_CONVERT_COMPRESSED_OOP` 或者 `INTERNAL_RT_USE_COMPRESSED_OOPS`，静态地判断是否需要 oop compress，如果需要，那么对象指针应该是压缩过的 `narrowOop`，如果不需要那么应该是一般的 `oop` 类型，并且通过 `std::conditional_t` 将返回值结果放在 type 中。

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
```Cpp
  template <DecoratorSet decorators, typename T>
  struct MustConvertCompressedOop: public std::integral_constant<bool,
    HasDecorator<decorators, INTERNAL_VALUE_IS_OOP>::value &&
    std::is_same<typename HeapOopType<decorators>::type, narrowOop>::value &&
    std::is_same<T, oop>::value> {};
```
一个元布尔值，传入 `DecoratorSet decorators` 和 `typename T`，通过检查 `decorators` 中是否设置了 `INTERNAL_VALUE_IS_OOP`、`decorators` 所指示的 HeapOopType（见上）是否为 narrowOop、以及 `T` 是否为 oop 这三者来确定自身的值是 true 还是 false。注意到只有当本次 access 配置的装饰器集合指示本次 access 是针对 narrowOop 的访问，并且 access 要求的返回值类型是 `oop` 是，才要求 must convert compress oop。

### EncodedType
```Cpp
// This metafunction returns an appropriate oop type if the value is oop-like
  // and otherwise returns the same type T.
  template <DecoratorSet decorators, typename T>
  struct EncodedType: AllStatic {
    using type = std::conditional_t<HasDecorator<decorators, INTERNAL_VALUE_IS_OOP>::value,
                                    typename HeapOopType<decorators>::type,
                                    T>;
  };
```
这是一个元函数，传入参数 `DecoratorSet decorators` 和 `typename T`，检查本次 access 的装饰器集合中是否配置了 `INTERNAL_VALUE_IS_OOP`，即本次访问是否是针对 oop 的访问？如果是的话那么就用 `HeapOopType` 从 `decorators` 中确定 oop 类型；如果不是的话那么就返回 T（即应该是一个基本类型访问）。

### oop_field_addr
```Cpp
template <DecoratorSet decorators>
  inline typename HeapOopType<decorators>::type*
  oop_field_addr(oop base, ptrdiff_t byte_offset) {
    return reinterpret_cast<typename HeapOopType<decorators>::type*>(
             reinterpret_cast<intptr_t>((void*)base) + byte_offset);
  }
```
一个一般的 Cpp 函数，返回值类型通过 `HeapOopType` 从元参数 `DecoratorSet decorators` 中提取，作用应该是给那些带有 `_at` 后缀的 OOP operation 组合出实际上应当访问的地址。一个简单的指针偏移，没啥好说的。

### PossiblyLockedAccess
```Cpp
// This metafunction returns whether it is possible for a type T to require
  // locking to support wide atomics or not.
  template <typename T>
#ifdef SUPPORTS_NATIVE_CX8
  struct PossiblyLockedAccess: public std::false_type {};
#else
  struct PossiblyLockedAccess: public std::integral_constant<bool, (sizeof(T) > 4)> {};
#endif
```
一个元函数，对于位宽较大的类型，可能硬件不支持单指令原子操作，需要加 lock 然后进行宽原子操作。

## Access Pipeline
这一部分具体介绍 Access 的流水线式派发。

### OOP type canonicalization
```Cpp
  template <typename T>
  struct OopOrNarrowOopInternal: AllStatic {
    typedef oop type;
  };

  template <>
  struct OopOrNarrowOopInternal<narrowOop>: AllStatic {
    typedef narrowOop type;
  };

  // This metafunction returns a canonicalized oop/narrowOop type for a passed
  // in oop-like types passed in from oop_* overloads where the user has sworn
  // that the passed in values should be oop-like (e.g. oop, oopDesc*, arrayOop,
  // narrowOoop, instanceOopDesc*, and random other things).
  // In the oop_* overloads, it must hold that if the passed in type T is not
  // narrowOop, then it by contract has to be one of many oop-like types implicitly
  // convertible to oop, and hence returns oop as the canonical oop type.
  // If it turns out it was not, then the implicit conversion to oop will fail
  // to compile, as desired.
  template <typename T>
  struct OopOrNarrowOop: AllStatic {
    typedef typename OopOrNarrowOopInternal<std::decay_t<T>>::type type;
  };
```

`OopOrNarrowOop` 做了类型规范化。
- 如果传入的 `T` 类型是 `narrowOop`，那没什么好说还是 `narrowOop`（直接匹配`OopOrNarrowOopInternal<narrowOop>`）。
- 如果传入的 `T` 类型是 `oop` 或者可以隐式转换为 `oop` 的类型（例如 `oopDesc*`，`arrayOop`，`instanceOopDesc*`）则会规范化到 `oop`（匹配`OopOrNarrowOopInternal<narrowOop>`失败，去匹配更弱一级的`template <typename T> OopOrNarrowOopInternal`，就会都变成 `oop` 类型）。
- 如果传入的 `T` 对上述两个都匹配失败，那么说明根本不是一个对象指针传进来了，应该 Error，编译失败，符合预期。

### Step 1
完成如下几件事情：
1. 类型检查。
2. 类型衰减（decay type），去除 const 和 volatile 关键字。
3. 补全装饰器，对未设置装饰器值的类别补上一个默认值（上文已述）。如果是 volatile 的那么默认内存序不是 unordered 而是 relaxed。

这一步仍然是用 `load` 操作来举例子。
```Cpp
  template <DecoratorSet decorators, typename P, typename T>
  inline T load(P* addr) {
    verify_types<decorators, T>();
    using DecayedP = std::decay_t<P>;
    using DecayedT = std::conditional_t<HasDecorator<decorators, INTERNAL_VALUE_IS_OOP>::value,
                                        typename OopOrNarrowOop<T>::type,
                                        std::decay_t<T>>;
    // If a volatile address is passed in but no memory ordering decorator,
    // set the memory ordering to MO_RELAXED by default.
    const DecoratorSet expanded_decorators = DecoratorFixup<
      (std::is_volatile<P>::value && !HasDecorator<decorators, MO_DECORATOR_MASK>::value) ?
      (MO_RELAXED | decorators) : decorators>::value;
    return load_reduce_types<expanded_decorators, DecayedT>(const_cast<DecayedP*>(addr));
  }
```

#### Verify types
```Cpp
  template <DecoratorSet decorators, typename T>
  static void verify_types(){
    // If this fails to compile, then you have sent in something that is
    // not recognized as a valid primitive type to a primitive Access function.
    STATIC_ASSERT((HasDecorator<decorators, INTERNAL_VALUE_IS_OOP>::value || // oops have already been validated
                   (std::is_pointer<T>::value || std::is_integral<T>::value) ||
                    std::is_floating_point<T>::value)); // not allowed primitive type
  }
```
所有流水线派发的第一步都会调用这个 `verify_types`。它会静态检查类型：
1. 是 OOP
2. 是 pointer
3. 是 integral
4. 是 floating point
除此之外的类型都不允许。

#### Decay type
```Cpp
    using DecayedP = std::decay_t<P>;
    using DecayedT = std::conditional_t<HasDecorator<decorators, INTERNAL_VALUE_IS_OOP>::value,
                                        typename OopOrNarrowOop<T>::type,
                                        std::decay_t<T>>;
```
在上面 load 的代码中可以看到，这里静态地利用了 `std::decay_t` 做了类型衰减，将指针 P 类型衰减为 DecayedP，将返回值类型 T 衰减为 DecayedT。其中 T 会进行一次特判，即如果是 OOP 类型的话，会利用前文所述的 `OopOrNarrowOop` 规范化为 `oop` 或者 `narrowOop`；如果是基本类型，那么就是用 `std::decay_t` 去除 CV 限定符（其实 std::decay_t 所做的不仅仅是这些，它会综合处理所有按值传递相关的转换，但是由于之前已经经过了类型检查，所以针对通过检查的类型基本能做的就是 CV 限定符去除了）。

#### Decorators fixup
这一步补全装饰器集合。
```Cpp
    // If a volatile address is passed in but no memory ordering decorator,
    // set the memory ordering to MO_RELAXED by default.
    const DecoratorSet expanded_decorators = DecoratorFixup<
      (std::is_volatile<P>::value && !HasDecorator<decorators, MO_DECORATOR_MASK>::value) ?
      (MO_RELAXED | decorators) : decorators>::value;
```
`DecoratorFixup` 之前已经介绍过，它作为一个元函数，会将传入的装饰器集合补全（将没设置的类别补上一个默认值），并用 `value` 返回出来。那么现在看一下传入的装饰器集合：
```Cpp
(std::is_volatile<P>::value && !HasDecorator<decorators, MO_DECORATOR_MASK>::value) ?
      (MO_RELAXED | decorators) : decorators
```
- 如果目前内存序类别中已经有装饰器了，那么就直接原样传入即可。
- 如果内存序类别中没有装饰器而且指针类型 P 是带着 volatile 关键字的，那么设置一个 `MO_RELAXED` 进去，这样 `DecoratorFixup` 就只会修复别的类别了。
- 如果内存序类别中没有配置装饰器而且指针类型 P 不是 volatile 的，那么还是原样传入，让 `DecoratorFixup` 加上默认的 `MO_UNORDERED`。

#### Invoke implementation
在类型检查和规范化都完成之后，就进入了流水线的下一步。
```Cpp
return load_reduce_types<expanded_decorators, DecayedT>(const_cast<DecayedP*>(addr));
```
带着修复好的装饰器集合以及通过类型检查、类型衰减和规范化的 DecayedT 和 DecayedP，进入 Step 2。

### Step 2: Reduce types
这一步检查 P 和 T 的类型，保证 P 和 T 是匹配的，即 P 是对应类型的指针类型，而 T 是对应类型的值类型。将错误的类型利用 SFINAE 报编译错误，并且将基本类型和 OOP 类型利用 SFINAE 分流，分开匹配。可以看一下这部分的注释。
```Cpp
` // Step 2: Reduce types.
  // Enforce that for non-oop types, T and P have to be strictly the same.
  // P is the type of the address and T is the type of the values.
  // As for oop types, it is allow to send T in {narrowOop, oop} and
  // P in {narrowOop, oop, HeapWord*}. The following rules apply according to
  // the subsequent table. (columns are P, rows are T)
  // |           | HeapWord  |   oop   | narrowOop |
  // |   oop     |  rt-comp  | hw-none |  hw-comp  |
  // | narrowOop |     x     |    x    |  hw-none  |
  //
  // x means not allowed
  // rt-comp means it must be checked at runtime whether the oop is compressed.
  // hw-none means it is statically known the oop will not be compressed.
  // hw-comp means it is statically known the oop will be compressed.
```

注意到 `P = pointer to HeapWord*` `T = oop` 的情况下需要运行时检查 `P` 这个地方存的是什么，如果是 oop 还好直接返回；如果是 `narrowOop` 就需要一步转换。而 `P = pointer to oop` `T = narrowOop` 是不允许的，这样会用位宽大的指针加载位宽小的值；同理 `P = pointer to HeapWord*` `T = narrowOop` 也不允许，因为 P 指的地方有可能真是一个 `oop`，这样也有可能位宽大的指针加载位宽小的值。

还是以 `load` 举例。
```Cpp
  template <DecoratorSet decorators, typename T>
  inline T load_reduce_types(T* addr) {
    return PreRuntimeDispatch::load<decorators, T>(addr);
  }

  template <DecoratorSet decorators, typename T>
  inline typename OopOrNarrowOop<T>::type load_reduce_types(narrowOop* addr) {
    const DecoratorSet expanded_decorators = decorators | INTERNAL_CONVERT_COMPRESSED_OOP |
                                             INTERNAL_RT_USE_COMPRESSED_OOPS;
    return PreRuntimeDispatch::load<expanded_decorators, typename OopOrNarrowOop<T>::type>(addr);
  }

  template <DecoratorSet decorators, typename T>
  inline oop load_reduce_types(HeapWord* addr) {
    const DecoratorSet expanded_decorators = decorators | INTERNAL_CONVERT_COMPRESSED_OOP;
    return PreRuntimeDispatch::load<expanded_decorators, oop>(addr);
  }
```
三个 `load_reduce_types`，分别匹配：
- 第一个，指针和值类型一样，匹配 `narrowOop* narrowOop` 和 `oop* oop` 的情况。不需要增加任何的装饰器。
- 第二个，指针是 `narrowOop*` 的，那么值就有可能是 `narrowOop` 或者 `oop` 的，通过 `OopOrNarrowOop` 根据装饰器集合判断。并且添加 `INTERNAL_CONVERT_COMPRESSED_OOP` 和 `INTERNAL_RT_USE_COMPRESSED_OOPS` 两个装饰器，需要进行一下解压缩。
- 第三个，指针是 `HeapWord*` 的，那么值就只能是 `oop`。添加 `INTERNAL_CONVERT_COMPRESSED_OOP` 这个装饰器。

在经过 Step 2 的 Reduce types 之后，会进入 Step 3 的预运行时分发。

### Step 3: Pre-runtime dispatch
预运行时分发阶段根据 barrier strength decorators，过滤掉 Raw Access，将它们直接生成代码，而不再继续向下走流水线，并且让 `RawAccessBarrier` 处理压缩指针和内存序装饰器；对于其他类型的访问，则继续经过运行时检查。

```Cpp
  struct PreRuntimeDispatch: AllStatic {
    template<DecoratorSet decorators>
    struct CanHardwireRaw: public std::integral_constant<
      bool,
      !HasDecorator<decorators, INTERNAL_VALUE_IS_OOP>::value || // primitive access
      !HasDecorator<decorators, INTERNAL_CONVERT_COMPRESSED_OOP>::value || // don't care about compressed oops (oop* address)
      HasDecorator<decorators, INTERNAL_RT_USE_COMPRESSED_OOPS>::value> // we can infer we use compressed oops (narrowOop* address)
    {};

    static const DecoratorSet convert_compressed_oops = INTERNAL_RT_USE_COMPRESSED_OOPS | INTERNAL_CONVERT_COMPRESSED_OOP;

    template<DecoratorSet decorators>
    static bool is_hardwired_primitive() {
      return !HasDecorator<decorators, INTERNAL_VALUE_IS_OOP>::value;
    }
```

首先 `CanHardwireRaw` 是一个元布尔值，为 true 时：
1. 装饰器表明这是一个基本类型访问。
2. 该访问是 OOP 访问，但是不需要关心 OOP 指针压缩问题。
3. 该访问是 OOP 访问，而且需要 Runtime 进行指针压缩解压缩操作。

如果 `CanHardwireRaw` 是真值，

还是以 load 操作举例。

```Cpp
    template <DecoratorSet decorators, typename T>
    inline static typename EnableIf<
      HasDecorator<decorators, AS_RAW>::value && CanHardwireRaw<decorators>::value, T>::type
    load(void* addr) {
      typedef RawAccessBarrier<decorators & RAW_DECORATOR_MASK> Raw;
      if (HasDecorator<decorators, INTERNAL_VALUE_IS_OOP>::value) {
        return Raw::template oop_load<T>(addr);
      } else {
        return Raw::template load<T>(addr);
      }
    }
```
匹配到这个 load 的，说明：
1. 本次 Access 是 `AS_RAW` 的。
2. 本次 Access 可以直接转化为硬编码。

那么再根据是 OOP 访问还是基本类型访问，调用 `RawAccessBarrier` 中的 `oop_load` 或者 `load` 即可，`RawAccessBarrier` 会继续处理，直接生成 C++ 代码，并由编译器编为二进制。

```Cpp
    template <DecoratorSet decorators, typename T>
    inline static typename EnableIf<
      HasDecorator<decorators, AS_RAW>::value && !CanHardwireRaw<decorators>::value, T>::type
    load(void* addr) {
      if (UseCompressedOops) {
        const DecoratorSet expanded_decorators = decorators | convert_compressed_oops;
        return PreRuntimeDispatch::load<expanded_decorators, T>(addr);
      } else {
        const DecoratorSet expanded_decorators = decorators & ~convert_compressed_oops;
        return PreRuntimeDispatch::load<expanded_decorators, T>(addr);
      }
    }
```
而对于无法直接特化为 C++ 代码的 Raw access，应该是在 `CanHardwireRaw` 中出了问题，这里会根据 OOP 访问还是基本类型访问，补全或者去除掉 `INTERNAL_RT_USE_COMPRESSED_OOPS` 和 `INTERNAL_CONVERT_COMPRESSED_OOP;` 这两个装饰器，然后再一次尝试匹配，这次匹配到第一个 load。

```Cpp
    template <DecoratorSet decorators, typename T>
    inline static typename EnableIf<
      !HasDecorator<decorators, AS_RAW>::value, T>::type
    load(void* addr) {
      if (is_hardwired_primitive<decorators>()) {
        const DecoratorSet expanded_decorators = decorators | AS_RAW;
        return PreRuntimeDispatch::load<expanded_decorators, T>(addr);
      } else {
        return RuntimeDispatch<decorators, T, BARRIER_LOAD>::load(addr);
      }
    }
```
而对于不是 Raw Access 的访问来说，会匹配到这个 load 上来。
- 对于基本类型的访问来说，即使是 `AS_NORMAL` 或别的什么访问类型，也可以被当做 Raw Access 直接生成 C++ 代码了，因为没啥区别，所以加上 `AS_RAW` 装饰器并再次匹配，这次匹配就应该匹配到第一个 load 并直接特化为 C++ 代码了。
- 对于非 Raw Access 的 OOP access 来说，就无法在静态确定如何生成 C++ 代码了，就需要进入 Runtime，并且根据 OOP operation 类型附加上一个 barrier 类型，比如 load 就是 `BARRIER_LOAD`。

### RawAccessBarrier
这个类比较大，主要是执行 Raw Access 用的，里面的方法用于 Raw Access 派发。
```Cpp
// The RawAccessBarrier performs raw accesses with additional knowledge of
// memory ordering, so that OrderAccess/Atomic is called when necessary.
// It additionally handles compressed oops, and hence is not completely "raw"
// strictly speaking.
template <DecoratorSet decorators>
class RawAccessBarrier: public AllStatic;
```
注意到注释提到，RawAccessBarrier 虽然声称是执行 RawAccess 的，但是其实还会考虑到内存序、oop压缩指针等。

```Cpp
// This mask specifies what decorators are relevant for raw accesses. When passing
// accesses to the raw layer, irrelevant decorators are removed.
const DecoratorSet RAW_DECORATOR_MASK = INTERNAL_DECORATOR_MASK | MO_DECORATOR_MASK |
                                        ARRAYCOPY_DECORATOR_MASK | IS_NOT_NULL;
```
定义了 `RawAccessBarrier` 所关心的所有装饰器类型。

#### field_addr
```Cpp
  static inline void* field_addr(oop base, ptrdiff_t byte_offset) {
    return AccessInternal::field_addr(base, byte_offset);
  }
```
代理一下之前见到的 `field_addr` 简单的计算一下地址。

#### encode / decode
```Cpp
  // Only encode if INTERNAL_VALUE_IS_OOP
  template <DecoratorSet idecorators, typename T>
  static inline typename EnableIf<
    AccessInternal::MustConvertCompressedOop<idecorators, T>::value,
    typename HeapOopType<idecorators>::type>::type
  encode_internal(T value);

  template <DecoratorSet idecorators, typename T>
  static inline typename EnableIf<
    !AccessInternal::MustConvertCompressedOop<idecorators, T>::value, T>::type
  encode_internal(T value) {
    return value;
  }

  template <typename T>
  static inline typename AccessInternal::EncodedType<decorators, T>::type
  encode(T value) {
    return encode_internal<decorators, T>(value);
  }

  // Only decode if INTERNAL_VALUE_IS_OOP
  template <DecoratorSet idecorators, typename T>
  static inline typename EnableIf<
    AccessInternal::MustConvertCompressedOop<idecorators, T>::value, T>::type
  decode_internal(typename HeapOopType<idecorators>::type value);

  template <DecoratorSet idecorators, typename T>
  static inline typename EnableIf<
    !AccessInternal::MustConvertCompressedOop<idecorators, T>::value, T>::type
  decode_internal(T value) {
    return value;
  }

  template <typename T>
  static inline T decode(typename AccessInternal::EncodedType<decorators, T>::type value) {
    return decode_internal<decorators, T>(value);
  }
```

注意到这些函数定义中使用的元参数 `DecoratorSet idecorators` 和 `RawAccessBarrier` 类型定义中的元参数 `DecoratorSet decorators` 是不一样的，即类成员函数的模板不绑定到类模板上。

注意这里面使用了 SFINAE (Substitution Failure Is Not An Error)，其中 `EnableIf` 就是 `std::enable_if` 的别名。会利用前文所述的元布尔值 `MustConvertCompressedOop` 检查传入的 `idecorators` 是否需要进行 Oop 压缩指针转换到 `T`，并且指针转换目标类型由 `HeapOopType` 元函数计算得出，即第一个 `encode_internal` 会执行压缩指针相关的。而这个 `encode_internal` 的实现细节如下：
```Cpp
template <DecoratorSet decorators>
template <DecoratorSet idecorators, typename T>
inline typename EnableIf<
  AccessInternal::MustConvertCompressedOop<idecorators, T>::value,
  typename HeapOopType<idecorators>::type>::type
RawAccessBarrier<decorators>::encode_internal(T value) {
  if (HasDecorator<decorators, IS_NOT_NULL>::value) {
    return CompressedOops::encode_not_null(value);
  } else {
    return CompressedOops::encode(value);
  }
}
```
注意到之前提到的 `IS_NOT_NULL` 装饰器在这里就发挥了作用：如果能够保证这个访问的 OOP 指针不是空指针，那么就可以调用开销较小的 `encode_not_null` 上了（少一次if，即 cmov 应该是）。


而如果第一个 encode_internal 匹配失败，它就是 Failure 而不是 Error，会继续尝试匹配第二个 `encode_internal`，即如果 `MustConvertCompressedOop` 检查到 `idecorators` 指示的 OOP 类型到 `T` 不需要压缩指针转换，那么就会匹配到这个 `encode_internal` 上，由于 `idecorators` 指示的返回类型应该是和 `T` 一致的，所以直接原样返回即可，不需要额外的编码逻辑。

而下方的 `encode` 函数则是对上方所有的 `encode_internal` 进行了封装，并且元参数和 `RawAccessBarrier` 保持一致了。这样，对基本类型、oop 类型和 narrowOop 类型的访问就统一使用了 `encode` 一个函数即可。

下方 `decode` 同样逻辑。总结 encode / decode 封装了 `RawAccessBarrier` 对 OOP 指针压缩的操作，通过 SFINAE 在编译期静态派发到具体函数。

#### load / store / atomic_cmpxchg / atomic_xchg
和上文所述的 encode / decode 一样，如果说它们利用 SFINAE 实现并封装了 `RawAccessBarrier` 关于 OOP 指针压缩的操作，那么这部分就是利用 SFINAE 实现并封装了 `RawAccessBarrier` 关于原子和内存序的操作。

以 load 操作举例分析，其他操作逻辑一样。
```Cpp
  template <typename T>
  static inline T load(void* addr) {
    return load_internal<decorators, T>(addr);
  }

  template <DecoratorSet ds, typename T>
  static typename EnableIf<
    HasDecorator<ds, MO_SEQ_CST>::value, T>::type
  load_internal(void* addr);

  template <DecoratorSet ds, typename T>
  static typename EnableIf<
    HasDecorator<ds, MO_ACQUIRE>::value, T>::type
  load_internal(void* addr);

  template <DecoratorSet ds, typename T>
  static typename EnableIf<
    HasDecorator<ds, MO_RELAXED>::value, T>::type
  load_internal(void* addr);

  template <DecoratorSet ds, typename T>
  static inline typename EnableIf<
    HasDecorator<ds, MO_UNORDERED>::value, T>::type
  load_internal(void* addr) {
    return *reinterpret_cast<T*>(addr);
  }
```

`load` 继承 `RawAccessBarrier` 的 `DecoratorSet decorators`，并自己持有返回值类型 `T`。并且派发到四个 `load_internal` 之一。由于在静态已经 verify 过，内存序装饰器类别中有且只能有一个装饰器被设置，所以一定是可以唯一静态派发到其中一个 `load_internal` 的，即分别是 `MO_SEQCST`，`MO_ACQUIRE`，`MO_RELAXED` 和 `MO_UNORDERED` 语义的 load 操作上（load一般没有 release 语义，所以如果是 release load 的话 Failure 就会模板匹配失败成为 error，正好是符合预期的）。

#### RawAccessBarrier oop operation
`RawAccessBarrier` 对 OOP 的操作同时要考虑 OOP 指针压缩的问题，以及原子操作内存序的问题。将这二者结合，就成为了 `RawAccessBarrier` 中有关 oop 的一系列操作，它们是 `RawAccessBarrier` 类对外主要暴露的接口。

```Cpp
  template <typename T>
  static void oop_store(void* addr, T value);
  template <typename T>
  static void oop_store_at(oop base, ptrdiff_t offset, T value);

  template <typename T>
  static T oop_load(void* addr);
  template <typename T>
  static T oop_load_at(oop base, ptrdiff_t offset);

  template <typename T>
  static T oop_atomic_cmpxchg(void* addr, T compare_value, T new_value);
  template <typename T>
  static T oop_atomic_cmpxchg_at(oop base, ptrdiff_t offset, T compare_value, T new_value);

  template <typename T>
  static T oop_atomic_xchg(void* addr, T new_value);
  template <typename T>
  static T oop_atomic_xchg_at(oop base, ptrdiff_t offset, T new_value);

  template <typename T>
  static bool oop_arraycopy(arrayOop src_obj, size_t src_offset_in_bytes, T* src_raw,
                            arrayOop dst_obj, size_t dst_offset_in_bytes, T* dst_raw,
                            size_t length);

  static void clone(oop src, oop dst, size_t size);
```

以 `oop_load` 为例子。
```Cpp
template <DecoratorSet decorators>
template <typename T>
inline T RawAccessBarrier<decorators>::oop_load(void* addr) {
  typedef typename AccessInternal::EncodedType<decorators, T>::type Encoded;
  Encoded encoded = load<Encoded>(reinterpret_cast<Encoded*>(addr));
  return decode<T>(encoded);
}
```
首先通过 `EncodedType` 推导出本次 OOP access 的 OOP 类型是怎样的，即确定是 narrowOop 还是 oop。然后通过 `load` 操作从地址 `addr` 中原子地将这个 oop 指针（或者 32bit narrowOop 指针）拿出来，最后通过 `decode` 调用 `CompressedOops` 解码（如果 `Encoded` 是 `oop` 那么原样返回，如果是 `narrowOop` 那么经过一些计算得到 `oop`），最终返回出 `T` 这个类型（实际上就应该是 `oop` 类型）。

### Step 4: Runtime dispatch
进入流水线这一步的，应该就是 非 Raw Access 且是 OOP Access 的。由于运行时分发需要在 JVM 实际跑起来之后才能知道使用的是什么 GC，以及别的一些运行时信息，所以需要附加的 barrier 在静态是不确定的，所以最开始这个 barrier pointer 会指向一个初始化函数（accessor resolution funciton），在首次调用时会解析到具体的函数并存储，在之后就直接访问它就行了，有点类似于动态链接库里面用于延迟绑定的 GOT / PLT。

先看 Access Functions 的定义。
#### AccessFunctionTypes
```Cpp
  template <DecoratorSet decorators, typename T>
  struct AccessFunctionTypes {
    typedef T (*load_at_func_t)(oop base, ptrdiff_t offset);
    typedef void (*store_at_func_t)(oop base, ptrdiff_t offset, T value);
    typedef T (*atomic_cmpxchg_at_func_t)(oop base, ptrdiff_t offset, T compare_value, T new_value);
    typedef T (*atomic_xchg_at_func_t)(oop base, ptrdiff_t offset, T new_value);

    typedef T (*load_func_t)(void* addr);
    typedef void (*store_func_t)(void* addr, T value);
    typedef T (*atomic_cmpxchg_func_t)(void* addr, T compare_value, T new_value);
    typedef T (*atomic_xchg_func_t)(void* addr, T new_value);

    typedef bool (*arraycopy_func_t)(arrayOop src_obj, size_t src_offset_in_bytes, T* src_raw,
                                     arrayOop dst_obj, size_t dst_offset_in_bytes, T* dst_raw,
                                     size_t length);
    typedef void (*clone_func_t)(oop src, oop dst, size_t size);
  };

  template <DecoratorSet decorators>
  struct AccessFunctionTypes<decorators, void> {
    typedef bool (*arraycopy_func_t)(arrayOop src_obj, size_t src_offset_in_bytes, void* src,
                                     arrayOop dst_obj, size_t dst_offset_in_bytes, void* dst,
                                     size_t length);
  };

  template <DecoratorSet decorators>
  struct AccessFunctionTypes<decorators, void> {
    typedef bool (*arraycopy_func_t)(arrayOop src_obj, size_t src_offset_in_bytes, void* src,
                                     arrayOop dst_obj, size_t dst_offset_in_bytes, void* dst,
                                     size_t length);
  };
```
这个类定义了各个 OOP operation 对应的函数类型。其中类的元参数中 `DecoratorSet decorators` 是本次访问的装饰器集合，`typename T` 是 OOP operation 的返回类型。

#### AccessFunction
```Cpp
  template <DecoratorSet decorators, typename T, BarrierType barrier> struct AccessFunction {};

#define ACCESS_GENERATE_ACCESS_FUNCTION(bt, func)                   \
  template <DecoratorSet decorators, typename T>                    \
  struct AccessFunction<decorators, T, bt>: AllStatic{              \
    typedef typename AccessFunctionTypes<decorators, T>::func type; \
  }
  ACCESS_GENERATE_ACCESS_FUNCTION(BARRIER_STORE, store_func_t);
  ACCESS_GENERATE_ACCESS_FUNCTION(BARRIER_STORE_AT, store_at_func_t);
  ACCESS_GENERATE_ACCESS_FUNCTION(BARRIER_LOAD, load_func_t);
  ACCESS_GENERATE_ACCESS_FUNCTION(BARRIER_LOAD_AT, load_at_func_t);
  ACCESS_GENERATE_ACCESS_FUNCTION(BARRIER_ATOMIC_CMPXCHG, atomic_cmpxchg_func_t);
  ACCESS_GENERATE_ACCESS_FUNCTION(BARRIER_ATOMIC_CMPXCHG_AT, atomic_cmpxchg_at_func_t);
  ACCESS_GENERATE_ACCESS_FUNCTION(BARRIER_ATOMIC_XCHG, atomic_xchg_func_t);
  ACCESS_GENERATE_ACCESS_FUNCTION(BARRIER_ATOMIC_XCHG_AT, atomic_xchg_at_func_t);
  ACCESS_GENERATE_ACCESS_FUNCTION(BARRIER_ARRAYCOPY, arraycopy_func_t);
  ACCESS_GENERATE_ACCESS_FUNCTION(BARRIER_CLONE, clone_func_t);
#undef ACCESS_GENERATE_ACCESS_FUNCTION

  template <DecoratorSet decorators, typename T, BarrierType barrier_type>
  typename AccessFunction<decorators, T, barrier_type>::type resolve_barrier();

  template <DecoratorSet decorators, typename T, BarrierType barrier_type>
  typename AccessFunction<decorators, T, barrier_type>::type resolve_oop_barrier();
```

针对每一个 OOP operation 的函数类型，都声明一个 `template <DecoratorSet decorators, typename T> struct AccessFunction<decorators, T, bt>`。这个 `AccessFunction` 作为元函数主要是返回里存储的 `typename AccessFunctionTypes<decorators, T>::func type`， 即根据 barrier type 就能推导对应哪一个 access function type（OOP operatio 的函数签名）。

```Cpp
  template <DecoratorSet decorators, typename T, BarrierType barrier_type>
  typename AccessFunction<decorators, T, barrier_type>::type resolve_barrier();

  template <DecoratorSet decorators, typename T, BarrierType barrier_type>
  typename AccessFunction<decorators, T, barrier_type>::type resolve_oop_barrier();
```
所以这两个函数 `resolve_barrier` 和 `resolve_oop_barrier` 都是这样的，根据传入的装饰器集合、访问的值类型 T 以及对应屏障类型，解析出来应该使用的访问函数的函数签名（函数类型）是怎样的。

#### AccessLocker
```Cpp
  class AccessLocker {
  public:
    AccessLocker();
    ~AccessLocker();
  };
  bool wide_atomic_needs_locking();
```
为位宽较大的类型模拟原子操作。

#### load 举例说明
```Cpp
  template <DecoratorSet decorators, typename T, BarrierType type>
  struct RuntimeDispatch: AllStatic {};
```

Runtime dispatch 有一个通用的 `RuntimeDispatch` 类，但是针对每一种 OOP operation 都会各自偏特化一个 `RuntimeDispatch` 出来，比如 load 的就是：

```Cpp
  template <DecoratorSet decorators, typename T>
  struct RuntimeDispatch<decorators, T, BARRIER_LOAD>: AllStatic {
    typedef typename AccessFunction<decorators, T, BARRIER_LOAD>::type func_t;
    static func_t _load_func;

    static T load_init(void* addr);

    static inline T load(void* addr) {
      assert_access_thread_state();
      return _load_func(addr);
    }
  };
```

只有设置了 `BARRIER_LOAD` 的才会偏特化到这个定义上面，即对应 load 操作。在调用 `load` 时，会委派给 `_load_func` 即类里面存储的 `static func_t _load_func`，这个 `func_t` 函数类型是静态就能够确定好的，就是 `typedef T (*load_func_t)(void* addr);`。这个 `_load_func` 在初始状态下是这样的：
```Cpp
  template <DecoratorSet decorators, typename T>
  typename AccessFunction<decorators, T, BARRIER_LOAD>::type
  RuntimeDispatch<decorators, T, BARRIER_LOAD>::_load_func = &load_init;
```

即指向了本类中定义的 `load_init` 函数。这个函数，以及别的 OOP operation 对应的 `store_init`，`atomic_cmpxchg_init` 等等初始化函数的签名都是没有实际意义的，仅仅是为了和各自的 `func_t` 保持一致以便静态存储在 `_load_func` 等里面。它们在内部做的事情都是一样的，以 load_init 为例：
```Cpp
  template <DecoratorSet decorators, typename T>
  T RuntimeDispatch<decorators, T, BARRIER_LOAD>::load_init(void* addr) {
    func_t function = BarrierResolver<decorators, func_t, BARRIER_LOAD>::resolve_barrier();
    _load_func = function;
    return function(addr);
  }
```
它会调用 `BarrierResolver` 的函数根据运行时信息来解析出具体是哪一个实际的 OOP operation 函数要使用，并且存储到 `_load_func` 中，并在初次调用中直接调用一次；后续调用就会直接走 `function` 了，`BarrierResolver::resolve_barrier` 对每一种 OOP operation 只会执行一次。

### Step 5.a Barrier resolution
```Cpp
  // Resolving accessors with barriers from the barrier set happens in two steps.
  // 1. Expand paths with runtime-decorators, e.g. is UseCompressedOops on or off.
  // 2. Expand paths for each BarrierSet available in the system.
  template <DecoratorSet decorators, typename FunctionPointerT, BarrierType barrier_type>
  struct BarrierResolver: public AllStatic
```
根据注释可以知道，Barrier resolution 分两步走。
1. 展开装饰器（取决于是否采用了 UseCompressedOops）。
2. 根据 GC 算法选择。

#### Expand decorator set
```Cpp
    static FunctionPointerT resolve_barrier_rt() {
      if (UseCompressedOops) {
        const DecoratorSet expanded_decorators = decorators | INTERNAL_RT_USE_COMPRESSED_OOPS;
        return resolve_barrier_gc<expanded_decorators>();
      } else {
        return resolve_barrier_gc<decorators>();
      }
    }

    static FunctionPointerT resolve_barrier() {
      return resolve_barrier_rt();
    }
```
在 Step 4 末尾介绍的调用 `resolve_barrier` 实际上会直接调用 `resolve_barrier_rt`。在这里首先根据是否启用了 UseCompressedOops 将装饰器集合添加 `INTERNAL_RT_USE_COMPRESSED_OOPS`。并且调用 `resolve_barrier_gc`。

`resolve_barrier_gc` 根据 `HasDecorator<ds, INTERNAL_VALUE_IS_OOP>` 进行 SFINAE，即根据是否是 OOP 访问派发到不同的函数上。

对于 INTERNAL_VALUE_IS_OOP 的：
```Cpp
    template <DecoratorSet ds>
    static typename EnableIf<
      HasDecorator<ds, INTERNAL_VALUE_IS_OOP>::value,
      FunctionPointerT>::type
    resolve_barrier_gc() {
      BarrierSet* bs = BarrierSet::barrier_set();
      assert(bs != nullptr, "GC barriers invoked before BarrierSet is set");
      switch (bs->kind()) {
#define BARRIER_SET_RESOLVE_BARRIER_CLOSURE(bs_name)                    \
        case BarrierSet::bs_name: {                                     \
          return PostRuntimeDispatch<typename BarrierSet::GetType<BarrierSet::bs_name>::type:: \
            AccessBarrier<ds>, barrier_type, ds>::oop_access_barrier; \
        }                                                               \
        break;
        FOR_EACH_CONCRETE_BARRIER_SET_DO(BARRIER_SET_RESOLVE_BARRIER_CLOSURE)
#undef BARRIER_SET_RESOLVE_BARRIER_CLOSURE

      default:
        fatal("BarrierSet AccessBarrier resolving not implemented");
        return nullptr;
      };
    }
```
从 `BarrierSet` 中根据对应 GC 算法取出合适的 GC 屏障集。并且对应 GC 算法进入 Post-runtime dispatch 返回真正的 OOP operation 函数。

而对于不是 INTERNAL_VALUE_IS_OOP 的，仅仅是将 `oop_access_barrier` 换成 `access_barrier`，其他地方没有区别。

然后现在先来看一下这堆宏是什么。完整的 context 如下。
```Cpp
// Do something for each concrete barrier set part of the build.
#define FOR_EACH_CONCRETE_BARRIER_SET_DO(f)          \
  f(CardTableBarrierSet)                             \
  EPSILONGC_ONLY(f(EpsilonBarrierSet))               \
  G1GC_ONLY(f(G1BarrierSet))                         \
  SHENANDOAHGC_ONLY(f(ShenandoahBarrierSet))         \
  ZGC_ONLY(f(XBarrierSet))                           \
  ZGC_ONLY(f(ZBarrierSet))

#define BARRIER_SET_RESOLVE_BARRIER_CLOSURE(bs_name)                    \
        case BarrierSet::bs_name: {                                     \
          return PostRuntimeDispatch<typename BarrierSet::GetType<BarrierSet::bs_name>::type:: \
            AccessBarrier<ds>, barrier_type, ds>::oop_access_barrier; \
        }                                                               \
        break;
        FOR_EACH_CONCRETE_BARRIER_SET_DO(BARRIER_SET_RESOLVE_BARRIER_CLOSURE)
#undef BARRIER_SET_RESOLVE_BARRIER_CLOSURE
```
很显然使用了 X-macro 技巧。诸如 `G1GC_ONLY` 这种是编译开关，是在构建JDK 的时候指定的。而对于打开编译开关的 GC 算法，比如我们打开了 `G1GC_ONLY` 在构建这个 JDK 时包括了 G1 GC 算法，那么这段宏就会将 `G1BarrierSet` 作为 bs_name 宏参数传递给 `BARRIER_SET_RESOLVE_BARRIER_CLOSURE`。那么宏展开为：
```Cpp
case BarrierSet::G1BarrierSet: {
  return PostRuntimeDispatch<typename BarrierSet::GetType<BarrierSet::G1BarrierSet>::type::
            AccessBarrier<ds>, barrier_type, ds>::oop_access_barrier;
}
break;
```
整段就是生成一堆 switch 语句而已。会根据拿到的 BarrierSet 类型做 Fake RTTI，然后做 Post-runtime dispatch。

### Step 5.b Post-runtime dispatch
在最终调用 `BarrierSet::AccessBarrier` 前还是要过一层这个 `PostRuntimeDispatch` 的。看注释更清楚：
```Cpp
  // Step 5.b: Post-runtime dispatch.
  // This class is the last step before calling the BarrierSet::AccessBarrier.
  // Here we make sure to figure out types that were not known prior to the
  // runtime dispatch, such as whether an oop on the heap is oop or narrowOop.
  // We also split orthogonal barriers such as handling primitives vs oops
  // and on-heap vs off-heap into different calls to the barrier set.
  template <class GCBarrierType, BarrierType type, DecoratorSet decorators>
  struct PostRuntimeDispatch: public AllStatic { };
```
这一步会在运行时弄清楚在静态不清楚的信息，比如说之前提到的 P 类型是 `HeapWord*` 的时候到底加载的对象指针是 `oop` 还是 `narrowOop`。以及会使用到 `ON_` 开头的那些访问位置装饰器。

`PostRuntimeDispatch` 这个类的定义方式和 `RuntimeDispatch` 很像，都是有一个空实现的模板类，然后根据每一种 OOP operation 偏特化出一个类。

还是以 load 操作举例。
```Cpp
  template <class GCBarrierType, DecoratorSet decorators>
  struct PostRuntimeDispatch<GCBarrierType, BARRIER_LOAD, decorators>: public AllStatic {
    template <typename T>
    static T access_barrier(void* addr) {
      return GCBarrierType::load_in_heap(reinterpret_cast<T*>(addr));
    }

    static oop oop_access_barrier(void* addr) {
      typedef typename HeapOopType<decorators>::type OopType;
      if (HasDecorator<decorators, IN_HEAP>::value) {
        return GCBarrierType::oop_load_in_heap(reinterpret_cast<OopType*>(addr));
      } else {
        return GCBarrierType::oop_load_not_in_heap(reinterpret_cast<OopType*>(addr));
      }
    }
  };
```
很明显，对于基本类型，`access_barrier` 会调用 `GCBarrierType::load_in_heap` 去实现。对于 OOP 的访问，根据访问位置的不同，`oop_access_barrier` 会调用 `GCBarrierType::oop_load_in_heap` 或者是 `GCBarrierType::oop_load_not_in_heap`。

这样，Post-runtime dispatch 对于非 Raw Access 的访问，又根据基本类型访问、Java 堆上 OOP 访问以及 Java 堆外 OOP 访问分别派发了三种 access barrier。

## GC Barrier
