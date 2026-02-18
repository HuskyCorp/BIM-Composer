#!/usr/bin/env python3
"""
Verification script to check if ifcopenshell and USD are properly installed.
Run during build phase to catch installation issues early.
"""
import sys
import json

def verify_imports():
    results = {"success": True, "modules": {}}

    # Test ifcopenshell
    try:
        import ifcopenshell
        results["modules"]["ifcopenshell"] = {
            "installed": True,
            "version": getattr(ifcopenshell, '__version__', 'unknown'),
            "path": ifcopenshell.__file__
        }
    except ImportError as e:
        results["success"] = False
        results["modules"]["ifcopenshell"] = {
            "installed": False,
            "error": str(e)
        }

    # Test USD
    try:
        from pxr import Usd, UsdGeom, Sdf, Gf
        import pxr
        results["modules"]["usd"] = {
            "installed": True,
            "version": getattr(pxr, '__version__', 'unknown'),
            "path": pxr.__file__
        }
    except ImportError as e:
        results["success"] = False
        results["modules"]["usd"] = {
            "installed": False,
            "error": str(e)
        }

    return results

if __name__ == "__main__":
    results = verify_imports()
    print(json.dumps(results, indent=2))
    sys.exit(0 if results["success"] else 1)
