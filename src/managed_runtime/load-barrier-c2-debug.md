# Debug OpenJDK 21 C2 compiler load barrier
Date: 2025-10-22

## Background
For researching reason, load barrier should be added to OpenJDK 21 G1 GC heap, mimicking write reference field pre-barrier. But there's bug.

#### Original code here
```Cpp
__ if_then(obj, BoolTest::ne, kit->null()); {
    const int lru_sample_counter_offset = in_bytes(G1ThreadLocalData::lru_sample_counter_offset());
    Node* lru_sample_counter_adr = __ AddP(no_base, tls, __ ConX(lru_sample_counter_offset));
    Node* lru_sample_counter = __ load(__ ctrl(), lru_sample_counter_adr, TypeX_X, index_bt, Compile::AliasIdxRaw);
    Node* next_counter = kit->gvn().transform(new SubXNode(lru_sample_counter, __ ConX(1)));

    const TypeFunc* tf = load_ref_field_entry_Type();
    __ make_leaf_call(tf, CAST_FROM_FN_PTR(address, G1BarrierSetRuntime::load_ref_field_entry), "load_ref_field_entry", obj, tls);

    __ if_then(lru_sample_counter, BoolTest::ne, zeroX, unlikely); {
      __ store(__ ctrl(), lru_sample_counter_adr, next_counter, index_bt, Compile::AliasIdxRaw, MemNode::unordered);
    } __ else_(); {

    }
    __ end_if();
} __ end_if();  // (val != NULL)
```

#### Problem
`G1BarrierSetRuntime::load_ref_field_entry` isn't actually called. If add `log_info(gc)("...");` before and after the call, both of the logs could be printed normally but the call isn't invoked actually.

#### Debugging
I doubt that the `__ if_then(...); {...} __ else_(); {...} __ end_if();` block after the "leaf call" makes the call actually not a leaf call, so that's might be the problem. So I modified the code piece into this:
```Cpp
__ if_then(obj, BoolTest::ne, kit->null()); {
    const int lru_sample_counter_offset = in_bytes(G1ThreadLocalData::lru_sample_counter_offset());
    Node* lru_sample_counter_adr = __ AddP(no_base, tls, __ ConX(lru_sample_counter_offset));
    Node* lru_sample_counter = __ load(__ ctrl(), lru_sample_counter_adr, TypeX_X, index_bt, Compile::AliasIdxRaw);
    Node* next_counter = kit->gvn().transform(new SubXNode(lru_sample_counter, __ ConX(1)));

    __ if_then(lru_sample_counter, BoolTest::ne, zeroX, unlikely); {
      __ store(__ ctrl(), lru_sample_counter_adr, next_counter, index_bt, Compile::AliasIdxRaw, MemNode::unordered);
    } __ else_(); {

    }
    __ end_if();

    const TypeFunc* tf = load_ref_field_entry_Type();
    __ make_leaf_call(tf, CAST_FROM_FN_PTR(address, G1BarrierSetRuntime::load_ref_field_entry), "load_ref_field_entry", obj, tls);

    // __ if_then(lru_sample_counter, BoolTest::ne, zeroX, unlikely); {
    // __ store(__ ctrl(), lru_sample_counter_adr, next_counter, index_bt, Compile::AliasIdxRaw, MemNode::unordered);
    // } __ else_(); {

    // }
    // __ end_if();
} __ end_if();  // (val != NULL)
```

Emm, notice that I just try to find out what's the problem and I don't care about the logic is right or not, so I just move the `if then` block to be in front of the call.

However this doesn't compile!

Oh, I don't mean compile error or something like that. It may compiles, but just takes way too much time that I don't have much patience waiting it (for a bunch of hours). I doubt it's because that `load_ref_field_entry` was filled with way too much logics (including nearly a hundred lines of code and serveral system calls, uh yes, system calls, in a load barrier!) that explodes when compiling. After I removed those logics, it compiles and, when running, triggered `load_ref_field_entry` finally.

So I tried several times and get this chart:
|          | `make_leaf_call` before `if` | `make_leaf_call` after `if`  |
|----------|------------------------------|------------------------------|
| Thin  LB | **Compiles fast, runs good** | **Compiles fast, runs good** |
| Heavy LB | Compiles fast, runs with bug | Compiles extremely slow      |

1. With a thin load barrier, `load_ref_field_entry` always called.
2. With a heavy load barrier, if `make_leaf_call` is placed before `if` block, the code compiles but `load_ref_field_entry` is not invoked.
3. With a heavy load barrier and `make_leaf_call` after `if`, the code compiles extremely slow, and the compiled image explodes.

#### Analysis
I don't know exactly how C2 compiler works so I can't speak much, in case leading others into a wrong thinking way. But since whether `make_leaf_call` is placed before or after `if` doesn't matters, it's mysterious why when there's a heavy load barrier, the code compiles and runs differently, one compiles fast but the leaf call seems to be removed, one compiles extremely slow and binary explodes.
