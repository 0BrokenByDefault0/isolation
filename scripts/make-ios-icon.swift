import AppKit

let size = 1024
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
                             bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false,
                             isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor(calibratedRed: 5 / 255, green: 6 / 255, blue: 8 / 255, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: CGFloat(size), height: CGFloat(size)).fill()
// Reuse the app's existing star favicon as its native icon.
let points: [(CGFloat, CGFloat)] = [(8,1),(9.5,6.5),(15,8),(9.5,9.5),(8,15),(6.5,9.5),(1,8),(6.5,6.5)]
let star = NSBezierPath()
for (i, point) in points.enumerated() {
    let p = NSPoint(x: 128 + point.0 * 48, y: 128 + (16 - point.1) * 48)
    if i == 0 { star.move(to: p) } else { star.line(to: p) }
}
star.close()
NSColor(calibratedRed: 61 / 255, green: 1, blue: 110 / 255, alpha: 1).setFill()
star.fill()
NSGraphicsContext.restoreGraphicsState()
let url = URL(fileURLWithPath: "ios/Isolation/Assets.xcassets/AppIcon.appiconset/AppIcon.png")
try bitmap.representation(using: .png, properties: [:])!.write(to: url)
