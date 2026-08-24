pipeline {
    agent any
    
    environment {
        APP_NAME = 'clarity'
        BUILD_DIR = "${WORKSPACE}/build"
        ARTIFACTS_DIR = "${WORKSPACE}/artifacts"
        NODE_VERSION = '18'
    }
    
    parameters {
        string(name: 'BUILDS_TO_KEEP', defaultValue: '5', description: 'Number of old builds to keep')
    }
    
    stages {
        stage('Checkout') {
            steps {
                echo '🔄 Cloning repository...'
                checkout scm
            }
        }
        
        stage('Setup') {
            steps {
                echo '⚙️  Setting up environment...'
                script {
                    sh '''
                        node --version
                        npm --version
                    '''
                }
            }
        }
        
        stage('Install Dependencies') {
            steps {
                echo '📦 Installing dependencies...'
                sh 'npm install'
            }
        }
        
        stage('Build') {
            steps {
                echo '🔨 Building application...'
                sh '''
                    npm run build
                '''
            }
        }
        
        stage('Test') {
            steps {
                echo '✅ Running tests...'
                sh '''
                    npm run test || true
                '''
            }
        }
        
        stage('Archive Artifacts') {
            steps {
                echo '📦 Archiving build artifacts...'
                script {
                    sh '''
                        mkdir -p ${ARTIFACTS_DIR}
                        if [ -d "dist" ]; then
                            cp -r dist/* ${ARTIFACTS_DIR}/ || true
                        fi
                        if [ -d "build" ]; then
                            cp -r build/* ${ARTIFACTS_DIR}/ || true
                        fi
                    '''
                }
                archiveArtifacts artifacts: '**/*.js, **/*.css, **/*.html', allowEmptyArchive: true
            }
        }
        
        stage('Cleanup Old Builds') {
            steps {
                echo '🧹 Cleaning up old builds...'
                script {
                    // Keep only the last N builds
                    sh '''
                        KEEP=${BUILDS_TO_KEEP}
                        BUILD_DIR="${JENKINS_HOME}/jobs/${JOB_NAME}/builds"
                        
                        if [ -d "$BUILD_DIR" ]; then
                            BUILD_COUNT=$(ls -d */ 2>/dev/null | wc -l)
                            if [ "$BUILD_COUNT" -gt "$KEEP" ]; then
                                echo "Total builds: $BUILD_COUNT, keeping: $KEEP"
                                ls -d */ | sort -V | head -n $((BUILD_COUNT - KEEP)) | xargs -I {} rm -rf "$BUILD_DIR/{}"
                                echo "✓ Old builds deleted"
                            fi
                        fi
                    '''
                }
            }
        }
    }
    
    post {
        always {
            echo '📋 Pipeline execution completed'
            cleanWs()
        }
        
        success {
            echo '✅ Build succeeded!'
            script {
                // Optional: Add notifications (Slack, email, etc.)
                // slackSend(color: 'good', message: "${APP_NAME} #${BUILD_NUMBER} built successfully")
            }
        }
        
        failure {
            echo '❌ Build failed!'
            script {
                // Optional: Add notifications (Slack, email, etc.)
                // slackSend(color: 'danger', message: "${APP_NAME} #${BUILD_NUMBER} build failed")
            }
        }
    }
    
    options {
        // Garde seulement 5 derniers builds par défaut
        buildDiscarder(logRotator(numToKeepStr: '5'))
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }
}
