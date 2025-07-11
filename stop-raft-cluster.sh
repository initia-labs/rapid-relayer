#!/bin/bash

# Stop Raft cluster
echo "🛑 Stopping Raft cluster..."

# Stop all nodes
for node in node-1 node-2 node-3; do
    if [ -f "pid.${node}" ]; then
        pid=$(cat "pid.${node}")
        echo "🔄 Stopping ${node} (PID: $pid)..."
        kill $pid 2>/dev/null
        rm "pid.${node}"
        echo "✅ Stopped ${node}"
    else
        echo "⚠️  No PID file found for ${node}"
    fi
done

# Clean up config files
echo "🧹 Cleaning up configuration files..."
rm -f config.node-*.json

echo "🎉 Cluster stopped and cleaned up!" 