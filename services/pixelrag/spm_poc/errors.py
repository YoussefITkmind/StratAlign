"""User-facing errors raised by the POC application layer."""


class PixelRAGError(RuntimeError):
    """PixelRAG could not fulfill a search request."""


class TileResolutionError(RuntimeError):
    """A PixelRAG hit could not be mapped to a local tile image."""


class VLMError(RuntimeError):
    """The configured vision-language model request failed."""


class StructuredOutputError(RuntimeError):
    """The model returned invalid structured output."""
