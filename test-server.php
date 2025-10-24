<?php
echo "<h2>Server Information</h2>";
echo "PHP Version: " . phpversion() . "<br>";
echo "Server Software: " . $_SERVER['SERVER_SOFTWARE'] . "<br>";
echo "Document Root: " . $_SERVER['DOCUMENT_ROOT'] . "<br>";

// Test if we can connect to MySQL
echo "<h3>MySQL Test</h3>";
$conn = @new mysqli("localhost", "root", "");
if ($conn->connect_error) {
    echo "MySQL Connection: ❌ Failed - " . $conn->connect_error . "<br>";
} else {
    echo "MySQL Connection: ✅ Success<br>";
    $conn->close();
}

// Test file permissions
echo "<h3>File Permissions Test</h3>";
if (!is_dir('uploads')) {
    mkdir('uploads', 0777, true);
    echo "Created uploads folder<br>";
}
if (!is_dir('uploads/payment_proofs')) {
    mkdir('uploads/payment_proofs', 0777, true);
    echo "Created payment_proofs folder<br>";
}

echo "Uploads folder: " . (is_dir('uploads') ? "✅ Exists" : "❌ Missing") . "<br>";
echo "Payment proofs folder: " . (is_dir('uploads/payment_proofs') ? "✅ Exists" : "❌ Missing") . "<br>";

// Test file writing
$testFile = 'uploads/test.txt';
if (file_put_contents($testFile, 'test')) {
    echo "File writing: ✅ Works<br>";
    unlink($testFile);
} else {
    echo "File writing: ❌ Failed<br>";
}
?>
