import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let size = 1024
let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
                        bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.setFillColor(CGColor(red: 5 / 255, green: 6 / 255, blue: 8 / 255, alpha: 1))
context.fill(CGRect(x: 0, y: 0, width: CGFloat(size), height: CGFloat(size)))
// Reuse the app's existing star favicon as its native icon.
let points: [(CGFloat, CGFloat)] = [(8,1),(9.5,6.5),(15,8),(9.5,9.5),(8,15),(6.5,9.5),(1,8),(6.5,6.5)]
let star = CGMutablePath()
for (i, point) in points.enumerated() {
    let p = CGPoint(x: 128 + point.0 * 48, y: 128 + (16 - point.1) * 48)
    if i == 0 { star.move(to: p) } else { star.addLine(to: p) }
}
star.closeSubpath()
context.addPath(star)
context.setFillColor(CGColor(red: 61 / 255, green: 1, blue: 110 / 255, alpha: 1))
context.fillPath()
let url = URL(fileURLWithPath: "ios/Isolation/Assets.xcassets/AppIcon.appiconset/AppIcon.png")
let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(destination, context.makeImage()!, nil)
precondition(CGImageDestinationFinalize(destination), "Could not create app icon")
