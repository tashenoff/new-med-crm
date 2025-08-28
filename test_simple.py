#!/usr/bin/env python3

import sys
import os

# Add the current directory to Python path
sys.path.insert(0, '/app')

try:
    from backend_test import ClinicAPITester
    
    # Test if the methods exist
    tester = ClinicAPITester("https://test.com")
    
    # Check if the method exists
    if hasattr(tester, 'test_create_service_category'):
        print("✅ test_create_service_category method exists")
    else:
        print("❌ test_create_service_category method does not exist")
        
    if hasattr(tester, 'test_get_service_categories'):
        print("✅ test_get_service_categories method exists")
    else:
        print("❌ test_get_service_categories method does not exist")
        
    # List all methods that contain 'category'
    methods = [method for method in dir(tester) if 'category' in method.lower()]
    print(f"Methods containing 'category': {methods}")
    
except Exception as e:
    print(f"Error importing: {e}")
    import traceback
    traceback.print_exc()