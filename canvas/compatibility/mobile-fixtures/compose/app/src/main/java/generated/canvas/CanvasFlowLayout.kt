package generated.canvas
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
fun Modifier.canvasClipToBounds(): Modifier = clipToBounds()
fun Modifier.canvasClipShape(shape: Shape): Modifier = clip(shape)
@OptIn(ExperimentalLayoutApi::class)
@Composable fun CanvasFlowLayout(content: @Composable () -> Unit) { FlowRow { content() } }
