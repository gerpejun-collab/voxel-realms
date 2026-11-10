$ErrorActionPreference = 'Stop'
$sdk = "C:\Users\workai\AppData\Local\Android\Sdk"
$bt = "$sdk\build-tools\34.0.0"
$androidJar = "$sdk\platforms\android-34\android.jar"
$jdkBin = "C:\Program Files\Android\Android Studio\jbr\bin"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$jdkBin;$bt;$env:PATH"

$projectRoot = "c:\Users\workai\Music\MINECRAFT ONRDER"
$buildDir = "$projectRoot\android\build\apk_out"
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
New-Item -ItemType Directory -Path "$buildDir\res_flat", "$buildDir\gen", "$buildDir\classes" | Out-Null

Write-Host "--> [1/7] Compiling Android resources with aapt2..."
& "$bt\aapt2.exe" compile --dir "$projectRoot\android\app\src\main\res" -o "$buildDir\res_flat\res.zip"

Write-Host "--> [2/7] Linking Android resources & manifest (v2) with aapt2..."
& "$bt\aapt2.exe" link -o "$buildDir\unaligned.apk" -I $androidJar --manifest "$projectRoot\android\app\src\main\AndroidManifest.xml" --java "$buildDir\gen" "$buildDir\res_flat\res.zip" --auto-add-overlay

Write-Host "--> [3/7] Compiling Java sources with javac..."
$javaFiles = @(
  "$buildDir\gen\com\voxelrealms\game\R.java",
  "$projectRoot\android\app\src\main\java\com\voxelrealms\game\MainActivity.java"
)
& "$jdkBin\javac.exe" -source 11 -target 11 -encoding UTF-8 -classpath $androidJar -d "$buildDir\classes" $javaFiles
& "$jdkBin\jar.exe" cf "$buildDir\classes.jar" -C "$buildDir\classes" .

Write-Host "--> [4/7] Converting bytecode to DEX with d8..."
$dexZip = "$buildDir\classes_dex.zip"
& "$jdkBin\java.exe" -cp "$bt\lib\d8.jar" com.android.tools.r8.D8 --lib $androidJar --min-api 24 --output $dexZip "$buildDir\classes.jar"
if (-not (Test-Path $dexZip)) { throw "classes_dex.zip was not generated!" }

Set-Location $buildDir
& "$jdkBin\jar.exe" xf $dexZip classes.dex
if (-not (Test-Path "$buildDir\classes.dex")) { throw "classes.dex was not extracted!" }

Write-Host "--> [5/7] Adding classes.dex to unaligned APK..."
& "$jdkBin\jar.exe" uf "$buildDir\unaligned.apk" classes.dex
Set-Location $projectRoot

Write-Host "--> [6/7] Aligning APK with zipalign..."
& "$bt\zipalign.exe" -f -p 4 "$buildDir\unaligned.apk" "$buildDir\aligned.apk"

Write-Host "--> [7/7] Generating release keystore and signing APK with apksigner..."
$keystore = "$buildDir\voxelrealms.keystore"
& "$jdkBin\keytool.exe" -genkeypair -v -keystore $keystore -storepass android -alias voxelrealmskey -keypass android -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=VoxelRealms,O=Android,C=ES"

$finalApk = "$projectRoot\VoxelRealms.apk"
& "$jdkBin\java.exe" -jar "$bt\lib\apksigner.jar" sign --ks $keystore --ks-pass pass:android --key-pass pass:android --out $finalApk "$buildDir\aligned.apk"
& "$jdkBin\java.exe" -jar "$bt\lib\apksigner.jar" verify --verbose $finalApk

# Deploy to public/ for web download
Copy-Item $finalApk "$projectRoot\public\VoxelRealms.apk" -Force

# Deploy to User Desktop
$desktopDir = "C:\Users\workai\Desktop"
if (Test-Path $desktopDir) {
    Copy-Item $finalApk "$desktopDir\VoxelRealms-v2.apk" -Force
    Copy-Item $finalApk "$desktopDir\VoxelRealms.apk" -Force
    Write-Host "--> Successfully copied new v2 APK to Desktop ($desktopDir\VoxelRealms-v2.apk and VoxelRealms.apk)"
} else {
    Write-Warning "Desktop directory not found: $desktopDir"
}

# Verify badging
Write-Host "--> Verifying APK badging (versionName & versionCode):"
& "$bt\aapt.exe" dump badging $finalApk | Select-String "package: name="

# Cleanup temporary build folder
Remove-Item -Recurse -Force "$projectRoot\android\build"

Write-Host "--> Build and deployment complete!"
Get-Item $finalApk, "$projectRoot\public\VoxelRealms.apk", "$desktopDir\VoxelRealms-v2.apk" | Select-Object FullName, Length, LastWriteTime
