package generated.canvas
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
fun Modifier.canvasClipToBounds(): Modifier = clipToBounds()
@OptIn(ExperimentalLayoutApi::class)
@Composable fun CanvasFlowLayout(content: @Composable () -> Unit) { FlowRow { content() } }
