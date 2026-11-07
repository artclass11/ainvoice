from pathlib import Path
import re
import sys

gradle_file = Path("src-tauri/gen/android/app/build.gradle.kts")
if not gradle_file.exists():
    sys.exit("Android app/build.gradle.kts was not generated.")

text = gradle_file.read_text()
if "signingConfigs" in text and 'signingConfig = signingConfigs.getByName("release")' in text:
    print("Android release signing already configured.")
    sys.exit(0)

if "import java.io.FileInputStream" not in text:
    text = "import java.io.FileInputStream\nimport java.util.Properties\n" + text

signing = """
    signingConfigs {
        create("release") {
            val keyPropertiesFile = rootProject.file("keystore.properties")
            val keyProperties = Properties()
            keyProperties.load(FileInputStream(keyPropertiesFile))
            keyAlias = keyProperties["keyAlias"] as String
            keyPassword = keyProperties["password"] as String
            storeFile = file(keyProperties["storeFile"] as String)
            storePassword = keyProperties["password"] as String
        }
    }
"""
if "    buildTypes {" not in text:
    sys.exit("Could not locate Android buildTypes block; inspect the generated Gradle file before signing.")
text = text.replace("    buildTypes {", signing + "\n    buildTypes {", 1)
release_pattern = r'(getByName\("release"\)\s*\{)'
if not re.search(release_pattern, text):
    sys.exit("Could not locate the release build type; inspect the generated Gradle file before signing.")
text = re.sub(release_pattern, r'\1\n            signingConfig = signingConfigs.getByName("release")', text, count=1)
gradle_file.write_text(text)
print("Configured Android release signing from CI secrets.")
