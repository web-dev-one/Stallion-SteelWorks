#!/bin/bash
# invalidate.sh
# Reusable script to invalidate CloudFront cache for StallionSteelWorks

# 🔧 Set your CloudFront distribution ID here (find it in AWS Console → CloudFront → Distributions)
DIST_ID="ENWN982XAMBRM"

# Check if a path argument was provided
if [ -z "$1" ]; then
  echo "Usage: ./invalidate.sh <path>"
  echo "Example: ./invalidate.sh /shade-structures.html"
  echo "Example: ./invalidate.sh /services/*"
  exit 1
fi

# Run the invalidation
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "$1"
