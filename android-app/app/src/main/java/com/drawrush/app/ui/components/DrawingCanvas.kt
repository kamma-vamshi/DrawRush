package com.drawrush.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import com.drawrush.app.data.model.DrawTool
import com.drawrush.app.ui.theme.DrCanvas
import com.drawrush.app.ui.theme.DrCanvasBorder
import com.drawrush.app.viewmodel.Stroke as StrokeData

/**
 * High-performance Compose drawing canvas.
 * Supports finger and stylus input, local optimistic rendering, and remote stroke display.
 *
 * Uses normalized coordinates (0f–1f) everywhere to be resolution-independent.
 * The artist draws locally; remoteStrokes are received from other players.
 */
@Composable
fun DrawingCanvas(
    localStrokes: List<StrokeData>,
    remoteStrokes: List<StrokeData>,
    isArtist: Boolean,
    onPointerDown: (x: Float, y: Float, w: Float, h: Float) -> Unit,
    onPointerMove: (x: Float, y: Float, w: Float, h: Float) -> Unit,
    onPointerUp: (x: Float, y: Float, w: Float, h: Float) -> Unit,
    modifier: Modifier = Modifier
) {
    var canvasSize = IntSize.Zero

    Box(
        modifier = modifier
            .background(DrCanvas)
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .onSizeChanged { canvasSize = it }
                .then(
                    if (isArtist) {
                        Modifier.pointerInput(Unit) {
                            detectDragGestures(
                                onDragStart = { offset ->
                                    onPointerDown(offset.x, offset.y,
                                        canvasSize.width.toFloat(), canvasSize.height.toFloat())
                                },
                                onDrag = { change, _ ->
                                    change.consume()
                                    onPointerMove(change.position.x, change.position.y,
                                        canvasSize.width.toFloat(), canvasSize.height.toFloat())
                                },
                                onDragEnd = {
                                    onPointerUp(0f, 0f,
                                        canvasSize.width.toFloat(), canvasSize.height.toFloat())
                                },
                                onDragCancel = {
                                    onPointerUp(0f, 0f,
                                        canvasSize.width.toFloat(), canvasSize.height.toFloat())
                                }
                            )
                        }
                    } else Modifier
                )
        ) {
            // Draw remote strokes first (background), then local on top
            val allStrokes = remoteStrokes + localStrokes
            for (stroke in allStrokes) {
                drawStroke(stroke, size.width, size.height)
            }
        }
    }
}

private fun DrawScope.drawStroke(stroke: StrokeData, canvasW: Float, canvasH: Float) {
    if (stroke.points.isEmpty()) return

    val strokeWidth = stroke.width * minOf(canvasW, canvasH)
    val color = try {
        Color(android.graphics.Color.parseColor(stroke.color))
    } catch (e: Exception) {
        Color.Black
    }

    val blendMode = when (stroke.tool) {
        DrawTool.eraser -> BlendMode.Clear
        DrawTool.brush -> BlendMode.SrcOver
    }

    val paint = Paint().apply {
        this.color = color
        this.blendMode = blendMode
    }

    if (stroke.points.size == 1) {
        val p = stroke.points[0]
        drawCircle(
            color = color,
            radius = strokeWidth / 2f,
            center = Offset(p.x * canvasW, p.y * canvasH),
            blendMode = blendMode
        )
        return
    }

    val path = Path()
    val first = stroke.points[0]
    path.moveTo(first.x * canvasW, first.y * canvasH)

    for (i in 1 until stroke.points.size) {
        val prev = stroke.points[i - 1]
        val curr = stroke.points[i]
        // Smooth curve using quadratic bezier
        val midX = (prev.x + curr.x) / 2f * canvasW
        val midY = (prev.y + curr.y) / 2f * canvasH
        path.quadraticBezierTo(
            prev.x * canvasW, prev.y * canvasH,
            midX, midY
        )
    }

    drawPath(
        path = path,
        color = color,
        style = Stroke(
            width = strokeWidth,
            cap = StrokeCap.Round,
            join = StrokeJoin.Round
        ),
        blendMode = blendMode
    )
}
