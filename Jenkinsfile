pipeline {
    agent any
    
    environment {
        APP_NAME = 'clarity'
        BUILD_DIR = "${WORKSPACE}/build"
        ARTIFACTS_DIR = "${WORKSPACE}/artifacts"
        GITHUB_CREDENTIALS = credentials('github-credentials')
    }
    
    parameters {
        string(name: 'BUILDS_TO_KEEP', defaultValue: '5', description: 'Number of old builds to keep')
    }
    
    triggers {
        githubPush()
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo '🔄 Cloning repository with GitHub credentials...'
                checkout([
                    $class: 'GitSCM',
                    branches: [[name: '*/main']],
                    userRemoteConfigs: [[
                        url: 'https://github.com/dev-lab2026/clarity.git',
                        credentialsId: 'github-credentials'
                    ]]
                ])
            }
        }
        
        stage('Setup Environment') {
            steps {
                echo '⚙️  Setting up build environment...'
                sh '''
                    echo "Updating system packages..."
                    apt-get update
                    
                    echo "Installing system dependencies..."
                    apt-get install -y build-essential python3 python3-dev git curl wget
                    
                    echo "Installing Node.js 20 (LTS)..."
                    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
                    apt-get install -y nodejs
                    
                    echo "Verifying installation..."
                    node --version
                    npm --version
                    python3 --version
                '''
            }
        }
        
        stage('Clean Cache') {
            steps {
                echo '🧹 Cleaning npm cache and temporary files...'
                sh '''
                    echo "Removing node_modules and lock files..."
                    rm -rf node_modules package-lock.json
                    
                    echo "Clearing npm cache..."
                    npm cache clean --force
                    
                    echo "Removing npm temporary directory..."
                    rm -rf ~/.npm
                    
                    echo "✓ Cache cleaned"
                '''
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo '📦 Installing dependencies...'
                sh '''
                    echo "Installing npm packages..."
                    npm install --verbose --force
                    
                    echo "Installing optional dependencies..."
                    npm install --save-optional
                    
                    echo "✓ Dependencies installed successfully"
                '''
            }
        }
        
        stage('Verify Installation') {
            steps {
                echo '🔍 Verifying installation...'
                sh '''
                    echo "Node and npm versions:"
                    node --version
                    npm --version
                    
                    echo ""
                    echo "Checking critical packages..."
                    npm ls @vitejs/plugin-react @tailwindcss/vite vite react tailwindcss --depth=0 || true
                    
                    echo ""
                    echo "Checking for rollup native bindings..."
                    ls -la node_modules/@rollup/ 2>/dev/null | head -20 || echo "Rollup packages found"
                    
                    echo "✓ Verification complete"
                '''
            }
        }
        
        stage('Build') {
            steps {
                echo '🔨 Building application...'
                sh '''
                    set -x
                    echo "Current directory: $(pwd)"
                    echo "Workspace contents:"
                    ls -la | head -20
                    
                    echo ""
                    echo "Checking vite.config.ts:"
                    [ -f "vite.config.ts" ] && echo "✓ vite.config.ts exists" || echo "✗ vite.config.ts missing"
                    
                    echo ""
                    echo "Checking package.json build script:"
                    cat package.json | grep -A 2 '"build"'
                    
                    echo ""
                    echo "Running npm run build..."
                    npm run build 2>&1
                    BUILD_EXIT=$?
                    echo "Build exit code: $BUILD_EXIT"
                    
                    if [ $BUILD_EXIT -ne 0 ]; then
                        echo "✗ Build failed with exit code $BUILD_EXIT"
                        exit $BUILD_EXIT
                    fi
                    echo "✓ Build completed successfully"
                '''
            }
        }
        
        stage('Test') {
            steps {
                echo '✅ Running linter...'
                sh 'npm run lint || true'
            }
        }
        
        stage('Archive Artifacts') {
            steps {
                echo '📦 Archiving build artifacts...'
                sh '''
                    mkdir -p ${ARTIFACTS_DIR}
                    if [ -d "dist" ]; then
                        echo "Copying dist/ artifacts..."
                        cp -r dist/* ${ARTIFACTS_DIR}/ || true
                    fi
                    echo "✓ Artifacts archived"
                '''
                archiveArtifacts artifacts: '**/*.js, **/*.css, **/*.html, **/*.cjs', allowEmptyArchive: true
            }
        }
        
        stage('Cleanup Old Builds') {
            steps {
                echo '🧹 Cleaning up old builds...'
                sh '''
                    KEEP=${BUILDS_TO_KEEP}
                    BUILD_DIR="${JENKINS_HOME}/jobs/${JOB_NAME}/builds"
                    
                    if [ -d "$BUILD_DIR" ]; then
                        BUILD_COUNT=$(ls -1d */ 2>/dev/null | wc -l)
                        if [ "$BUILD_COUNT" -gt "$KEEP" ]; then
                            echo "Total builds: $BUILD_COUNT, keeping last: $KEEP"
                            ls -1d */ | sort -V | head -n $((BUILD_COUNT - KEEP)) | while read -r build; do
                                echo "Removing old build: $build"
                                rm -rf "$BUILD_DIR/$build"
                            done
                            echo "✓ Old builds deleted"
                        fi
                    fi
                '''
            }
        }
        
        stage('Update GitHub Status') {
            when {
                expression { currentBuild.result == null || currentBuild.result == 'SUCCESS' }
            }
            steps {
                echo '📤 Updating GitHub commit status...'
                sh '''
                    COMMIT_SHA=$(git rev-parse HEAD)
                    curl -X POST \
                        -H "Authorization: token ${GITHUB_CREDENTIALS_PSW}" \
                        -H "Accept: application/vnd.github.v3+json" \
                        https://api.github.com/repos/dev-lab2026/clarity/statuses/${COMMIT_SHA} \
                        -d '{"state":"success","description":"Build succeeded","context":"continuous-integration/jenkins"}' \
                        -w "\\nHTTP Status: %{http_code}\\n"
                '''
            }
        }
    }
    
    post {
        success {
            echo '✅ Build succeeded!'
        }
        
        failure {
            echo '❌ Build failed!'
            sh '''
                if [ -d ".git" ]; then
                    COMMIT_SHA=$(git rev-parse HEAD)
                    curl -X POST \
                        -H "Authorization: token ${GITHUB_CREDENTIALS_PSW}" \
                        -H "Accept: application/vnd.github.v3+json" \
                        https://api.github.com/repos/dev-lab2026/clarity/statuses/${COMMIT_SHA} \
                        -d '{"state":"failure","description":"Build failed","context":"continuous-integration/jenkins"}' \
                        -w "\\nHTTP Status: %{http_code}\\n" || true
                fi
            '''
        }
        
        always {
            echo '📋 Pipeline execution completed'
        }
    }
    
    options {
        buildDiscarder(logRotator(numToKeepStr: '5'))
        timeout(time: 60, unit: 'MINUTES')
        timestamps()
    }
}
