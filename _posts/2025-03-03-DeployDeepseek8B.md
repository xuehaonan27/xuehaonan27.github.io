---
layout: post
title: 部署一个DeepSeek8B模型
date: 2025-03-03
---

# 下载
```shell
export HF_ENDPOINT=https://hf-mirror.com
huggingface-cli download --resume-download deepseek-ai/DeepSeek-R1-Distill-Llama-8B --local-dir DeepSeek-R1-Distill-Llama-8B

export HF_ENDPOINT=https://hf-mirror.com
huggingface-cli download --resume-download bartowski/Qwen_QwQ-32B-GGUF Qwen_QwQ-32B-Q8_0.gguf --local-dir Qwen_QwQ-32B-GGUF --local-dir-use-symlinks False

huggingface-cli download --resume-download bartowski/Qwen_QwQ-32B-GGUF Qwen_QwQ-32B-IQ2_XS.gguf --local-dir Qwen_QwQ-32B-GGUF --local-dir-use-symlinks False
```

# 运行server
```shell
MODEL_NAME=DeepSeek-R1-Distill-Llama-8B
python3 -m vllm.entrypoints.openai.api_server --host=127.0.0.1 --port=8000 --model=$HOME/Projects/$MODEL_NAME --max_model_len=32768
```

# 使用NextChat部署一个前端
不想用docker了，简单部署一个NextChat前端用用就行。
```shell
git clone git@github.com:ChatGPTNextWeb/NextChat.git

# 下面的setup参见这里
# https://raw.githubusercontent.com/Yidadaa/ChatGPT-Next-Web/main/scripts/setup.sh

cd ChatGPT-Next-Web
yarn install
PORT=8081 yarn build
OPENAI_API_BASE_URL=http://localhost:8000/v1 \
OPENAI_API_KEY=EMPTY \
DEFAULT_MODEL=DeepSeek-R1-Distill-Llama-8B \
PORT=8081 \
yarn start
# PORT=8081 yarn start
```

# 编译llama.cpp
```shell
cmake -B build \
  -DCMAKE_C_COMPILER=/usr/bin/clang \
  -DCMAKE_CXX_COMPILER=/usr/bin/clang++ \
  -DOpenMP_C_FLAGS="-Xpreprocessor -fopenmp -I$(brew --prefix libomp)/include" \
  -DOpenMP_CXX_FLAGS="-Xpreprocessor -fopenmp -I$(brew --prefix libomp)/include" \
  -DOpenMP_C_LIB_NAMES="omp" \
  -DOpenMP_CXX_LIB_NAMES="omp" \
  -DOpenMP_omp_LIBRARY=$(brew --prefix libomp)/lib/libomp.dylib

cmake --build build --config Release -j 8
```