---
layout: post
title: 配置好MacMini M4
date: 2025-03-02
---

新买的MacMini M4到货了，可以开始配置。

# 包管理策略
手动管理。Homebrew 用起来不太好用。

# ClashXMeta
```
https://github.com/MetaCubeX/ClashX.Meta/releases/download/v1.4.9/ClashX.Meta.zip
```
拉取这个就行。我自己从源码构建失败了，应该是go版本的问题，懒得弄了。

# Rust toolchain
```shell
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

在`~/.cargo/config`写入
```toml
[http]
proxy = "127.0.0.1:7890"

[https]
proxy = "127.0.0.1:7890"
```

# Golang toolchain
```
https://go.dev/dl/go1.24.0.darwin-arm64.pkg
```
配置走国内镜像
```shell
go env -w GOPROXY=https://goproxy.cn
```

# iTerm2
```
https://iterm2.com/downloads/stable/latest
```
之后配置iTerm2自己检查更新即可

# Oh My Zsh
```shell
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

没有代理用这个
```shell
sh -c "$(curl -fsSL https://install.ohmyz.sh/)"
```

# Catppuccin Colors
```shell
git clone git@github.com:catppuccin/iterm
```

# htop
```shell
curl -O https://github.com/htop-dev/htop/releases/download/3.3.0/htop-3.3.0.tar.xz
tar -xf htop-3.3.0.tar.xz
cd htop-3.3.0
./configure
make
sudo make install
```

# nodejs with yarn
```shell
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# in lieu of restarting the shell
. "$HOME/.nvm/nvm.sh"
# Download and install Node.js:
nvm install 22
# Verify the Node.js version:
node -v # Should print "v22.14.0".
nvm current # Should print "v22.14.0".
# Download and install Yarn:
corepack enable yarn
# Verify Yarn version:
yarn -v
```

# GNU
首先使用 MacOS 自带的gcc（其实是clang）来编译一个gcc出来，然后我们继续使用这个gcc来编译其他GNU工具。
首先需要编译GCC依赖的库。
## GMP
```shell
curl -O https://ftp.gnu.org/gnu/gmp/gmp-6.3.0.tar.xz
tar -xf gmp-6.3.0.tar.xz
cd gmp-6.3.0
./configure \
    --prefix=/opt/gmp/6.3.0 \
    --enable-cxx \
    --enable-shared \
    --enable-static
make
sudo make install
```

## MPFR
```shell
curl -O https://ftp.gnu.org/gnu/mpfr/mpfr-4.2.0.tar.xz
tar -xf mpfr-4.2.1.tar.xz
cd mpfr-4.2.1
./configure \
    --prefix=/opt/mpfr/4.2.1 \
    --with-gmp=/opt/gmp/6.3.0 \
    --enable-shared \
    --enable-static \
    --enable-thread-safe \
    --enable-formally-proven-code
make
sudo make install
```

## MPC
```shell
curl -O curl -O https://ftp.gnu.org/gnu/mpc/mpc-1.3.1.tar.gz
tar -xf mpc-1.3.1.tar.gz
cd mpc-1.3.1
./configure \
    --prefix=/opt/mpc/1.3.1 \
    --with-gmp=/opt/gmp/6.3.0 \
    --with-mpfr=/opt/mpfr/4.2.1 \
    --enable-shared \
    --enable-static
make
sudo make install
```

## ISL
```shell
curl -O https://ftp.gnu.org/gnu/isl/isl-0.24.tar.xz
tar -xf isl-0.24.tar.xz
cd isl-0.24
./configure \
    --prefix=/opt/isl/0.24 \
    --enable-shared \
    --enable-static \
    --with-gmp-prefix=/opt/gmp/6.3.0
make
sudo make install
```

## ZSTD
```shell
curl -O https://github.com/facebook/zstd/releases/download/v1.5.7/zstd-1.5.7.tar.gz
tar -xf zstd-1.5.7.tar.gz
cd zstd-1.5.7
make PREFIX=/opt/zstd/1.5.7
sudo make PREFIX=/opt/zstd/1.5.7 install
```

然后我们就可以构建一个尽可能完全的GCC了。
## GCC
```shell
curl -O "https://ftp.gnu.org/gnu/gcc/gcc-14.2.0/gcc-14.2.0.tar.gz"
curl -O "https://github.com/Homebrew/formula-patches/blob/master/gcc/gcc-14.2.0-r2.diff"
tar -xf gcc-14.2.0.tar.gz
cd gcc-14.2.0
patch -p1 < ../gcc-14.2.0-r2.diff
./configure \
    --prefix=/opt/gcc/14.2.0 \
    --disable-nls \
    --enable-ld=yes \
    --enable-gold=yes \
    --enable-gprofng=yes \
    --enable-year2038 \
    --enable-libada \
    --enable-libgm2 \
    --enable-libssp \
    --enable-bootstrap \
    --enable-lto \
    --enable-checking=release \
    --with-gcc-major-version-only \
    --enable-languages=c,c++,objc,obj-c++,fortran,m2 \
    --with-gmp=/opt/gmp/6.3.0 \
    --with-mpfr=/opt/mpfr/4.2.1 \
    --with-mpc=/opt/mpc/1.3.1 \
    --with-isl=/opt/isl/0.24 \
    --with-zstd=/opt/zstd/1.5.7 \
    --with-system-zlib \
    --with-sysroot=/Library/Developer/CommandLineTools/SDKs/MacOSX15.sdk \
    --build=aarch64-apple-darwin24
make
sudo make install

```

## binutils
```shell
curl -O "https://ftp.gnu.org/gnu/binutils/binutils-with-gold-2.44.tar.gz"
tar -xf binutils-with-gold-2.44.tar.gz
cd binutils-with-gold-2.44

CC=/opt/gcc/14.2.0/bin/gcc \
CXX=/opt/gcc/14.2.0/bin/g++ \
AR=/opt/gcc/14.2.0/bin/gcc-ar \
NM=/opt/gcc/14.2.0/bin/gcc-nm \
./configure \
    --prefix=/opt/binutils/2.44 \
    --enable-gold=yes \
    --enable-ld=yes \
    --enable-year2038 \
    --enable-libada \
    --enable-libgm2 \
    --enable-libssp \
    --enable-pgo-build \
    --enable-lto \
    --with-zstd=/opt/zstd/1.5.7 \
    --with-mpc=/opt/mpc/1.3.1 \
    --with-mpfr=/opt/mpfr/4.2.1 \
    --with-gmp=/opt/gmp/6.3.0 \
    --with-isl=/opt/isl/0.24 \
    --with-gcc-major-version-only \
    --with-build-sysroot=/Library/Developer/CommandLineTools/SDKs/MacOSX15.sdk \
    --build=aarch64-apple-darwin24
```

```shell
# 然后自举
make clean
CC=/opt/gcc/14.2.0/bin/gcc \
CPP=/opt/gcc/14.2.0/bin/cpp \
CXX=/opt/gcc/14.2.0/bin/g++ \
./configure \
    --prefix=/opt/gcc/14.2.0 \
    --disable-nls \
    --enable-ld=yes \
    --enable-gold=yes \
    --enable-gprofng=yes \
    --enable-year2038 \
    --enable-libada \
    --enable-libgm2 \
    --enable-libssp \
    --enable-bootstrap \
    --enable-lto \
    --enable-checking=release \
    --with-gcc-major-version-only \
    --enable-languages=c,c++,objc,obj-c++,fortran,m2 \
    --with-gmp=/opt/gmp/6.3.0 \
    --with-mpfr=/opt/mpfr/4.2.1 \
    --with-mpc=/opt/mpc/1.3.1 \
    --with-isl=/opt/isl/0.24 \
    --with-zstd=/opt/zstd/1.5.7 \
    --with-system-zlib \
    --with-sysroot=/Library/Developer/CommandLineTools/SDKs/MacOSX15.sdk \
    --build=aarch64-apple-darwin24
make
sudo make install
```

```
Libraries have been installed in:
   /opt/gcc/14.2.0/lib

If you ever happen to want to link against installed libraries
in a given directory, LIBDIR, you must either use libtool, and
specify the full pathname of the library, or use the `-LLIBDIR'
flag during linking and do at least one of the following:
   - add LIBDIR to the `DYLD_LIBRARY_PATH' environment variable
     during execution

See any operating system documentation about shared libraries for
more information, such as the ld(1) and ld.so(8) manual pages.
```

### m4
```shell
curl -O "https://ftp.gnu.org/gnu/m4/m4-1.4.19.tar.gz"
tar -xf m4-1.4.19.tar.gz
cd m4-1.4.19
CC=/opt/gcc/14.2.0/bin/gcc \
CPP=/opt/gcc/14.2.0/bin/cpp \
CXX=/opt/gcc/14.2.0/bin/g++ \
./configure --prefix=/opt/m4/1.4.19
```

### autoconf
```shell
curl -O "https://ftp.gnu.org/gnu/autoconf/autoconf-2.72.tar.gz"
tar -xf autoconf-2.72.tar.gz
cd autoconf-2.72
./configure --prefix=/opt/autoconf/2.72 --with-gcc=/opt/gcc/14.2.0/bin/gcc
make
sudo make install
```

### automake

### autopoint

### makeinfo

### help2man


## wget2
```shell
git clone https://github.com/wg/wget2.git
cd wget2
./bootstrap
./configure \
    --prefix=/opt/wget2/2.0.0 \
    --with-openssl \
    --with-libpsl \
    --with-libidn2 \
    --with-libiconv \
```
