# Bundled fonts

Add the generated Swift sources and all files in Fonts to the app target. Include Fonts in Copy Bundle Resources (a preserved Fonts folder or flattened resource files both work). Generated view initializers register the packaged faces before use. No system-wide installation or font subscription is required.
