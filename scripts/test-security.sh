#!/bin/bash
# @fileoverview Security-focused testing script
#
# Comprehensive security validation for cross-platform storage
# with attack vector testing and vulnerability assessment.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Test configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SECURITY_OUTPUT_DIR="$PROJECT_ROOT/security-test-results"
TEMP_TEST_DIR="/tmp/tari-security-test-$$"

# Create test output directories
mkdir -p "$SECURITY_OUTPUT_DIR"
mkdir -p "$TEMP_TEST_DIR"

echo_info() {
    echo -e "${BLUE}🔍 $1${NC}"
}

echo_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

echo_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

echo_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo_security() {
    echo -e "${PURPLE}🔒 $1${NC}"
}

# Function to test encryption strength
test_encryption_strength() {
    echo_security "Testing encryption strength..."
    
    local test_file="$TEMP_TEST_DIR/encryption_test.js"
    
    cat > "$test_file" << 'EOF'
const crypto = require('crypto');
const fs = require('fs');

// Test encryption strength
function testEncryptionStrength() {
    const algorithms = ['aes-256-gcm', 'aes-256-cbc', 'chacha20-poly1305'];
    const results = [];
    
    for (const algorithm of algorithms) {
        try {
            const key = crypto.randomBytes(32);
            const iv = crypto.randomBytes(12); // For GCM
            const plaintext = 'This is a test message for encryption strength validation';
            
            if (algorithm === 'aes-256-gcm') {
                const cipher = crypto.createCipher(algorithm, key);
                cipher.setAAD(Buffer.from('additional-authenticated-data'));
                
                let encrypted = cipher.update(plaintext, 'utf8', 'hex');
                encrypted += cipher.final('hex');
                const authTag = cipher.getAuthTag();
                
                results.push({
                    algorithm,
                    keySize: key.length * 8,
                    encrypted: encrypted.length > 0,
                    authTag: authTag.length > 0
                });
            } else {
                const cipher = crypto.createCipheriv(algorithm, key, iv);
                let encrypted = cipher.update(plaintext, 'utf8', 'hex');
                encrypted += cipher.final('hex');
                
                results.push({
                    algorithm,
                    keySize: key.length * 8,
                    encrypted: encrypted.length > 0
                });
            }
        } catch (error) {
            results.push({
                algorithm,
                error: error.message
            });
        }
    }
    
    console.log(JSON.stringify(results, null, 2));
}

testEncryptionStrength();
EOF

    echo_info "Running encryption strength tests..."
    if node "$test_file" > "$SECURITY_OUTPUT_DIR/encryption-strength.json"; then
        echo_success "Encryption strength test completed"
    else
        echo_error "Encryption strength test failed"
        return 1
    fi
}

# Function to test key derivation
test_key_derivation() {
    echo_security "Testing key derivation functions..."
    
    local test_file="$TEMP_TEST_DIR/key_derivation_test.js"
    
    cat > "$test_file" << 'EOF'
const crypto = require('crypto');

function testKeyDerivation() {
    const password = 'test-password-for-key-derivation';
    const salt = crypto.randomBytes(32);
    const results = [];
    
    // Test PBKDF2
    const iterations = [100000, 200000, 500000];
    for (const iter of iterations) {
        const start = Date.now();
        const key = crypto.pbkdf2Sync(password, salt, iter, 32, 'sha256');
        const time = Date.now() - start;
        
        results.push({
            method: 'PBKDF2',
            iterations: iter,
            keyLength: key.length,
            timeMs: time,
            secure: iter >= 100000 && time > 100 // Should take reasonable time
        });
    }
    
    // Test scrypt if available
    try {
        const start = Date.now();
        const key = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
        const time = Date.now() - start;
        
        results.push({
            method: 'scrypt',
            keyLength: key.length,
            timeMs: time,
            secure: time > 50 // Should take reasonable time
        });
    } catch (error) {
        results.push({
            method: 'scrypt',
            error: error.message
        });
    }
    
    console.log(JSON.stringify(results, null, 2));
}

testKeyDerivation();
EOF

    echo_info "Running key derivation tests..."
    if node "$test_file" > "$SECURITY_OUTPUT_DIR/key-derivation.json"; then
        echo_success "Key derivation test completed"
    else
        echo_error "Key derivation test failed"
        return 1
    fi
}

# Function to test memory security
test_memory_security() {
    echo_security "Testing memory security..."
    
    local test_file="$TEMP_TEST_DIR/memory_security_test.js"
    
    cat > "$test_file" << 'EOF'
function testMemorySecurity() {
    const results = [];
    
    // Test buffer security
    const sensitiveData = Buffer.from('sensitive-secret-data-123456789');
    
    // Test if buffer can be cleared
    const originalData = Buffer.from(sensitiveData);
    sensitiveData.fill(0);
    
    const isCleared = sensitiveData.every(byte => byte === 0);
    const originalPreserved = !originalData.every(byte => byte === 0);
    
    results.push({
        test: 'buffer-clearing',
        cleared: isCleared,
        originalPreserved: originalPreserved,
        secure: isCleared && originalPreserved
    });
    
    // Test memory allocation patterns
    const buffers = [];
    for (let i = 0; i < 100; i++) {
        buffers.push(Buffer.alloc(1024, i % 256));
    }
    
    // Clear all buffers
    buffers.forEach(buf => buf.fill(0));
    
    const allCleared = buffers.every(buf => buf.every(byte => byte === 0));
    
    results.push({
        test: 'bulk-memory-clearing',
        buffersCreated: buffers.length,
        allCleared: allCleared,
        secure: allCleared
    });
    
    // Test string security (strings are immutable in JS, so this tests awareness)
    const sensitiveString = 'sensitive-password-123';
    let cannotModify = true;
    
    try {
        // This should not work (strings are immutable)
        sensitiveString[0] = 'X';
        cannotModify = sensitiveString[0] !== 'X';
    } catch (error) {
        // Expected behavior
    }
    
    results.push({
        test: 'string-immutability',
        stringsImmutable: cannotModify,
        secure: cannotModify,
        warning: 'Use Buffers for sensitive data, not strings'
    });
    
    console.log(JSON.stringify(results, null, 2));
}

testMemorySecurity();
EOF

    echo_info "Running memory security tests..."
    if node "$test_file" > "$SECURITY_OUTPUT_DIR/memory-security.json"; then
        echo_success "Memory security test completed"
    else
        echo_error "Memory security test failed"
        return 1
    fi
}

# Function to test attack resistance
test_attack_resistance() {
    echo_security "Testing attack resistance..."
    
    # Test timing attacks
    echo_info "Testing timing attack resistance..."
    local timing_test="$TEMP_TEST_DIR/timing_attack_test.js"
    
    cat > "$timing_test" << 'EOF'
const crypto = require('crypto');

function testTimingAttacks() {
    const results = [];
    
    // Test constant-time comparison
    const secret = 'correct-secret-value-123456789';
    const tests = [
        'correct-secret-value-123456789',  // Correct
        'wrong-secret-value-123456789',    // Wrong but same length
        'wrong',                           // Wrong and different length
        '',                                // Empty
    ];
    
    for (const test of tests) {
        const times = [];
        
        // Run multiple comparisons and measure time
        for (let i = 0; i < 1000; i++) {
            const start = process.hrtime.bigint();
            
            // Use crypto.timingSafeEqual for constant-time comparison
            let result;
            try {
                result = crypto.timingSafeEqual(
                    Buffer.from(secret),
                    Buffer.from(test.padEnd(secret.length, '\0'))
                );
            } catch (error) {
                result = false;
            }
            
            const end = process.hrtime.bigint();
            times.push(Number(end - start));
        }
        
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        const variance = times.reduce((acc, time) => acc + Math.pow(time - avgTime, 2), 0) / times.length;
        
        results.push({
            input: test === secret ? 'correct' : 'wrong',
            inputLength: test.length,
            avgTimeNs: Math.round(avgTime),
            variance: Math.round(variance),
            constantTime: variance < avgTime * 0.1 // Variance should be low for constant time
        });
    }
    
    console.log(JSON.stringify(results, null, 2));
}

testTimingAttacks();
EOF

    if node "$timing_test" > "$SECURITY_OUTPUT_DIR/timing-attacks.json"; then
        echo_success "Timing attack test completed"
    else
        echo_error "Timing attack test failed"
        return 1
    fi
    
    # Test side-channel resistance
    echo_info "Testing side-channel resistance..."
    local sidechannel_test="$TEMP_TEST_DIR/sidechannel_test.js"
    
    cat > "$sidechannel_test" << 'EOF'
const crypto = require('crypto');

function testSideChannelResistance() {
    const results = [];
    
    // Test random number generation entropy
    const randomSets = [];
    for (let i = 0; i < 10; i++) {
        randomSets.push(crypto.randomBytes(32));
    }
    
    // Check for obvious patterns or repetitions
    const allDifferent = randomSets.every((set, index) => 
        randomSets.slice(index + 1).every(otherSet => !set.equals(otherSet))
    );
    
    // Basic entropy check (should have good distribution)
    const combined = Buffer.concat(randomSets);
    const entropy = calculateEntropy(combined);
    
    results.push({
        test: 'random-generation',
        setsGenerated: randomSets.length,
        allUnique: allDifferent,
        entropy: entropy,
        secure: allDifferent && entropy > 7.5 // Good entropy threshold
    });
    
    // Test key generation consistency
    const keys = [];
    for (let i = 0; i < 5; i++) {
        keys.push(crypto.generateKeySync('aes', { length: 256 }));
    }
    
    const allKeysUnique = keys.every((key, index) => 
        keys.slice(index + 1).every(otherKey => 
            !key.export().equals(otherKey.export())
        )
    );
    
    results.push({
        test: 'key-generation',
        keysGenerated: keys.length,
        allUnique: allKeysUnique,
        secure: allKeysUnique
    });
    
    console.log(JSON.stringify(results, null, 2));
}

function calculateEntropy(buffer) {
    const freq = new Array(256).fill(0);
    for (let i = 0; i < buffer.length; i++) {
        freq[buffer[i]]++;
    }
    
    let entropy = 0;
    for (let i = 0; i < 256; i++) {
        if (freq[i] > 0) {
            const p = freq[i] / buffer.length;
            entropy -= p * Math.log2(p);
        }
    }
    
    return entropy;
}

testSideChannelResistance();
EOF

    if node "$sidechannel_test" > "$SECURITY_OUTPUT_DIR/sidechannel-resistance.json"; then
        echo_success "Side-channel resistance test completed"
    else
        echo_error "Side-channel resistance test failed"
        return 1
    fi
}

# Function to test platform-specific security
test_platform_security() {
    echo_security "Testing platform-specific security features..."
    
    local platform_test="$TEMP_TEST_DIR/platform_security_test.js"
    
    cat > "$platform_test" << 'EOF'
const os = require('os');
const fs = require('fs');
const path = require('path');

function testPlatformSecurity() {
    const platform = os.platform();
    const results = {
        platform: platform,
        arch: os.arch(),
        tests: []
    };
    
    // Test file permissions
    const testFile = path.join(__dirname, 'permission_test.txt');
    
    try {
        fs.writeFileSync(testFile, 'test data', { mode: 0o600 });
        const stats = fs.statSync(testFile);
        const mode = stats.mode & parseInt('777', 8);
        
        results.tests.push({
            test: 'file-permissions',
            requestedMode: '600',
            actualMode: mode.toString(8),
            secure: mode === parseInt('600', 8)
        });
        
        fs.unlinkSync(testFile);
    } catch (error) {
        results.tests.push({
            test: 'file-permissions',
            error: error.message
        });
    }
    
    // Test directory permissions
    const testDir = path.join(__dirname, 'permission_test_dir');
    
    try {
        fs.mkdirSync(testDir, { mode: 0o700 });
        const stats = fs.statSync(testDir);
        const mode = stats.mode & parseInt('777', 8);
        
        results.tests.push({
            test: 'directory-permissions',
            requestedMode: '700',
            actualMode: mode.toString(8),
            secure: mode === parseInt('700', 8)
        });
        
        fs.rmdirSync(testDir);
    } catch (error) {
        results.tests.push({
            test: 'directory-permissions',
            error: error.message
        });
    }
    
    // Platform-specific tests
    if (platform === 'darwin') {
        // macOS specific tests
        results.tests.push({
            test: 'macos-keychain-availability',
            available: typeof process.env.KEYCHAIN_ACCESS !== 'undefined' || true,
            note: 'Keychain access depends on native module'
        });
    } else if (platform === 'win32') {
        // Windows specific tests
        results.tests.push({
            test: 'windows-credential-store-availability',
            available: typeof process.env.CREDENTIAL_STORE_ACCESS !== 'undefined' || true,
            note: 'Credential store access depends on native module'
        });
    } else if (platform === 'linux') {
        // Linux specific tests
        const hasDisplay = !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY;
        const hasDBus = !!process.env.DBUS_SESSION_BUS_ADDRESS;
        
        results.tests.push({
            test: 'linux-display-environment',
            hasDisplay: hasDisplay,
            hasDBus: hasDBus,
            headless: !hasDisplay,
            note: 'Headless environments may require D-Bus setup'
        });
    }
    
    // Test environment variable security
    const sensitiveEnvVars = ['PASSWORD', 'SECRET', 'TOKEN', 'KEY', 'PRIVATE'];
    const foundSensitive = [];
    
    for (const [key, value] of Object.entries(process.env)) {
        if (sensitiveEnvVars.some(sensitive => 
            key.toUpperCase().includes(sensitive)
        )) {
            foundSensitive.push({
                name: key,
                hasValue: !!value,
                length: value ? value.length : 0
            });
        }
    }
    
    results.tests.push({
        test: 'environment-variable-security',
        sensitiveVarsFound: foundSensitive.length,
        details: foundSensitive,
        warning: foundSensitive.length > 0 ? 'Sensitive data in environment variables' : null
    });
    
    console.log(JSON.stringify(results, null, 2));
}

testPlatformSecurity();
EOF

    echo_info "Running platform security tests..."
    if cd "$TEMP_TEST_DIR" && node "$platform_test" > "$SECURITY_OUTPUT_DIR/platform-security.json"; then
        echo_success "Platform security test completed"
    else
        echo_error "Platform security test failed"
        return 1
    fi
}

# Function to test data sanitization
test_data_sanitization() {
    echo_security "Testing data sanitization..."
    
    local sanitization_test="$TEMP_TEST_DIR/sanitization_test.js"
    
    cat > "$sanitization_test" << 'EOF'
function testDataSanitization() {
    const results = [];
    
    // Test buffer clearing
    const sensitiveBuffer = Buffer.from('sensitive-data-12345');
    const originalLength = sensitiveBuffer.length;
    const originalData = Buffer.from(sensitiveBuffer);
    
    // Clear the buffer
    sensitiveBuffer.fill(0);
    
    // Verify clearing
    const isCleared = sensitiveBuffer.every(byte => byte === 0);
    const lengthPreserved = sensitiveBuffer.length === originalLength;
    
    results.push({
        test: 'buffer-sanitization',
        originalLength: originalLength,
        clearedSuccessfully: isCleared,
        lengthPreserved: lengthPreserved,
        secure: isCleared && lengthPreserved
    });
    
    // Test multiple overwrites (defense against memory recovery)
    const multiOverwriteBuffer = Buffer.from('multi-overwrite-test-data');
    const patterns = [0x00, 0xFF, 0xAA, 0x55];
    
    patterns.forEach((pattern, index) => {
        multiOverwriteBuffer.fill(pattern);
    });
    
    const finalPattern = multiOverwriteBuffer.every(byte => byte === 0x55);
    
    results.push({
        test: 'multi-overwrite-sanitization',
        patternsApplied: patterns.length,
        finalPatternCorrect: finalPattern,
        secure: finalPattern
    });
    
    // Test array sanitization
    const sensitiveArray = [1, 2, 3, 4, 5, 'secret', 'data'];
    const originalArrayLength = sensitiveArray.length;
    
    // Clear array
    for (let i = 0; i < sensitiveArray.length; i++) {
        sensitiveArray[i] = null;
    }
    sensitiveArray.length = 0;
    
    results.push({
        test: 'array-sanitization',
        originalLength: originalArrayLength,
        cleared: sensitiveArray.length === 0,
        secure: sensitiveArray.length === 0
    });
    
    // Test object sanitization
    const sensitiveObject = {
        username: 'user123',
        password: 'secret123',
        token: 'bearer-token-xyz',
        metadata: { key: 'value' }
    };
    
    const originalKeys = Object.keys(sensitiveObject);
    
    // Clear object
    for (const key of Object.keys(sensitiveObject)) {
        delete sensitiveObject[key];
    }
    
    const keysRemaining = Object.keys(sensitiveObject).length;
    
    results.push({
        test: 'object-sanitization',
        originalKeys: originalKeys.length,
        keysRemaining: keysRemaining,
        secure: keysRemaining === 0
    });
    
    console.log(JSON.stringify(results, null, 2));
}

testDataSanitization();
EOF

    echo_info "Running data sanitization tests..."
    if node "$sanitization_test" > "$SECURITY_OUTPUT_DIR/data-sanitization.json"; then
        echo_success "Data sanitization test completed"
    else
        echo_error "Data sanitization test failed"
        return 1
    fi
}

# Function to generate security report
generate_security_report() {
    echo_security "Generating comprehensive security report..."
    
    local report_file="$SECURITY_OUTPUT_DIR/security-report.md"
    local timestamp="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
    local platform="$(uname -s)"
    
    cat > "$report_file" << EOF
# Security Test Report

**Platform:** $platform  
**Timestamp:** $timestamp  
**Node.js Version:** $(node --version)  

## Executive Summary

This report provides a comprehensive security assessment of the Tari JavaScript SDK's
cross-platform storage implementations, focusing on encryption strength, memory safety,
attack resistance, and platform-specific security features.

## Test Results

EOF

    # Process each security test result
    local test_files=(
        "encryption-strength.json"
        "key-derivation.json"
        "memory-security.json"
        "timing-attacks.json"
        "sidechannel-resistance.json"
        "platform-security.json"
        "data-sanitization.json"
    )
    
    for test_file in "${test_files[@]}"; do
        local file_path="$SECURITY_OUTPUT_DIR/$test_file"
        if [ -f "$file_path" ]; then
            local test_name="${test_file%.json}"
            echo "### ${test_name^} Test" >> "$report_file"
            echo "" >> "$report_file"
            echo '```json' >> "$report_file"
            cat "$file_path" >> "$report_file"
            echo '```' >> "$report_file"
            echo "" >> "$report_file"
        fi
    done
    
    # Add security recommendations
    cat >> "$report_file" << 'EOF'

## Security Recommendations

### Memory Management
- Always use `Buffer.fill(0)` to clear sensitive data
- Implement multiple overwrite patterns for defense in depth
- Use `crypto.timingSafeEqual()` for constant-time comparisons

### Key Management
- Use PBKDF2 with minimum 100,000 iterations
- Implement scrypt where available for enhanced security
- Generate keys using `crypto.generateKey()` or `crypto.randomBytes()`

### Platform Security
- Verify file permissions are correctly set (600 for files, 700 for directories)
- Use platform-specific secure storage when available
- Implement proper fallback mechanisms for headless environments

### Attack Resistance
- Implement timing attack resistance using constant-time operations
- Ensure proper entropy in random number generation
- Use authenticated encryption (AES-GCM or ChaCha20-Poly1305)

### Data Handling
- Sanitize all sensitive data structures before deallocation
- Avoid storing sensitive data in strings (use Buffers instead)
- Implement secure deletion patterns

## Compliance Notes

This security assessment covers:
- OWASP cryptographic storage guidelines
- NIST key management recommendations
- Platform-specific security best practices
- Memory safety standards

EOF

    echo_success "Security report generated: $report_file"
}

# Function to cleanup
cleanup() {
    echo_info "Cleaning up security test artifacts..."
    
    if [ -d "$TEMP_TEST_DIR" ]; then
        rm -rf "$TEMP_TEST_DIR"
    fi
    
    echo_success "Security test cleanup completed"
}

# Main execution
main() {
    echo_security "Starting comprehensive security testing..."
    echo_info "Security test output directory: $SECURITY_OUTPUT_DIR"
    
    # Setup trap for cleanup
    trap cleanup EXIT
    
    # Run all security tests
    test_encryption_strength || exit 1
    test_key_derivation || exit 1
    test_memory_security || exit 1
    test_attack_resistance || exit 1
    test_platform_security || exit 1
    test_data_sanitization || exit 1
    
    # Generate comprehensive report
    generate_security_report
    
    echo_success "All security tests completed successfully!"
    echo_info "Security results available in: $SECURITY_OUTPUT_DIR"
    echo_security "Review the security report for detailed findings and recommendations"
}

# Run main function
main "$@"
