package generated.canvas
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.runtime.Composable
@OptIn(ExperimentalLayoutApi::class)
@Composable fun CanvasFlowLayout(content: @Composable () -> Unit) { FlowRow { content() } }
