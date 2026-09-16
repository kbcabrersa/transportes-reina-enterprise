"""Ejecuta las pruebas de Chrome/CDP y Firestore Emulator (Node 22+)."""
from pathlib import Path
import subprocess
import sys

sys.exit(subprocess.call(['node', str(Path(__file__).with_suffix('.mjs'))]))
