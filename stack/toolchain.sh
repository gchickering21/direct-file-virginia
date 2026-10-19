# Source this to get the toolchain the IRS Form Builder stack needs: JDK 21, sbt 1.11, Node 22.
# Prebuilt binaries under ~/.dpi-toolchain, because Homebrew builds the JDK from source on
# macOS 13 (hours). On a newer Mac `brew install openjdk@21 sbt` works and this file is optional.
#
#   JDK: https://github.com/adoptium/temurin21-binaries/releases  (OpenJDK21U-jdk_x64_mac_hotspot, or aarch64)
#        untar into ~/.dpi-toolchain and symlink ~/.dpi-toolchain/jdk21 -> jdk-21*/Contents/Home
#   sbt: https://github.com/sbt/sbt/releases/download/v1.11.4/sbt-1.11.4.zip, unzip into ~/.dpi-toolchain
#   Node: nvm install 22
T="$HOME/.dpi-toolchain"
[ -d "$T/jdk21" ] && export JAVA_HOME="$T/jdk21" && export PATH="$T/jdk21/bin:$PATH"
[ -d "$T/sbt/bin" ] && export PATH="$T/sbt/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; nvm use 22 >/dev/null 2>&1 || nvm install 22 >/dev/null; fi
