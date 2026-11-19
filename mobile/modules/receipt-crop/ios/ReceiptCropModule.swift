// Finds the receipt in a camera photo and crops it straight (pilot feedback
// 2026-11-19: "the original should only have the receipt, not the table
// behind it"). Runs on the phone with Apple's Vision framework: nothing
// leaves the device. Conservative on purpose: a crop that cuts off the total
// would ruin the evidence, so anything uncertain returns the photo as taken.

import CoreImage
import ExpoModulesCore
import UIKit
import Vision

public class ReceiptCropModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReceiptCrop")

    // Off the main thread (async functions run on the module's queue).
    AsyncFunction("cropReceipt") { (uri: URL) -> [String: Any] in
      return ReceiptCropper.crop(fileURL: uri)
    }
  }
}

enum ReceiptCropper {
  // Tuning (to check on real receipts): how sure Vision must be, and how
  // much of the frame the receipt must cover. Below the lower bound it is
  // more likely a label or a card than the receipt; above the upper one
  // there is next to nothing to crop.
  static let minSegmentationConfidence: VNConfidence = 0.7
  static let minArea: CGFloat = 0.15
  static let maxArea: CGFloat = 0.95
  // Room left around the detected edges, as a share of the receipt's size,
  // so a slightly-off edge or a curled corner never cuts a line of print.
  static let padding: CGFloat = 0.04
  // A crop smaller than this (pixels) on either side isn't worth reading.
  static let minSide: CGFloat = 300

  static func crop(fileURL: URL) -> [String: Any] {
    let unchanged: [String: Any] = ["uri": fileURL.absoluteString, "cropped": false]
    guard fileURL.isFileURL,
          let data = try? Data(contentsOf: fileURL),
          // The camera's JPEG carries its rotation in EXIF: apply it, so the
          // detection and the crop work on the picture as the person saw it.
          let image = CIImage(data: data, options: [.applyOrientationProperty: true])
    else { return unchanged }

    guard let quad = detect(in: image) else { return unchanged }
    let area = quadArea(quad)
    guard area >= minArea, area <= maxArea else { return unchanged }

    let extent = image.extent
    func toImage(_ p: CGPoint) -> CGPoint {
      CGPoint(x: extent.origin.x + p.x * extent.width, y: extent.origin.y + p.y * extent.height)
    }
    let padded = pad(quad)
    guard let filter = CIFilter(name: "CIPerspectiveCorrection") else { return unchanged }
    filter.setValue(image, forKey: kCIInputImageKey)
    filter.setValue(CIVector(cgPoint: toImage(padded.topLeft)), forKey: "inputTopLeft")
    filter.setValue(CIVector(cgPoint: toImage(padded.topRight)), forKey: "inputTopRight")
    filter.setValue(CIVector(cgPoint: toImage(padded.bottomLeft)), forKey: "inputBottomLeft")
    filter.setValue(CIVector(cgPoint: toImage(padded.bottomRight)), forKey: "inputBottomRight")
    guard let output = filter.outputImage,
          output.extent.width >= minSide, output.extent.height >= minSide
    else { return unchanged }

    let context = CIContext(options: [.useSoftwareRenderer: false])
    guard let cgImage = context.createCGImage(output, from: output.extent),
          let jpeg = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.92)
    else { return unchanged }

    let target = FileManager.default.temporaryDirectory
      .appendingPathComponent("receipt-crop-\(UUID().uuidString).jpg")
    do {
      try jpeg.write(to: target, options: .atomic)
    } catch {
      return unchanged
    }
    return ["uri": target.absoluteString, "cropped": true]
  }

  /// The receipt's four corners, normalised (0–1, origin bottom left), or nil.
  static func detect(in image: CIImage) -> Quad? {
    let handler = VNImageRequestHandler(ciImage: image, options: [:])

    // Apple's document detector, trained for paper on a background. No
    // plain rectangle detection as a fallback: it would as readily return a
    // framed table inside an A4 invoice or a card slip lying on the receipt,
    // and crop away the seller's name, numbers or date.
    let segmentation = VNDetectDocumentSegmentationRequest()
    if (try? handler.perform([segmentation])) != nil,
       let best = segmentation.results?.first,
       best.confidence >= minSegmentationConfidence {
      return Quad(best)
    }
    return nil
  }

  /// The quad's area as a share of the picture (shoelace formula).
  static func quadArea(_ q: Quad) -> CGFloat {
    let p = [q.topLeft, q.topRight, q.bottomRight, q.bottomLeft]
    var sum: CGFloat = 0
    for i in 0..<4 {
      let a = p[i], b = p[(i + 1) % 4]
      sum += a.x * b.y - b.x * a.y
    }
    return abs(sum) / 2
  }

  /// Each corner moved away from the centre by `padding`, kept inside the picture.
  static func pad(_ q: Quad) -> Quad {
    let cx = (q.topLeft.x + q.topRight.x + q.bottomLeft.x + q.bottomRight.x) / 4
    let cy = (q.topLeft.y + q.topRight.y + q.bottomLeft.y + q.bottomRight.y) / 4
    func out(_ p: CGPoint) -> CGPoint {
      let x = cx + (p.x - cx) * (1 + padding * 2)
      let y = cy + (p.y - cy) * (1 + padding * 2)
      return CGPoint(x: min(max(x, 0), 1), y: min(max(y, 0), 1))
    }
    return Quad(topLeft: out(q.topLeft), topRight: out(q.topRight), bottomLeft: out(q.bottomLeft), bottomRight: out(q.bottomRight))
  }
}

struct Quad {
  let topLeft: CGPoint
  let topRight: CGPoint
  let bottomLeft: CGPoint
  let bottomRight: CGPoint

  init(topLeft: CGPoint, topRight: CGPoint, bottomLeft: CGPoint, bottomRight: CGPoint) {
    self.topLeft = topLeft
    self.topRight = topRight
    self.bottomLeft = bottomLeft
    self.bottomRight = bottomRight
  }

  init(_ o: VNRectangleObservation) {
    self.init(topLeft: o.topLeft, topRight: o.topRight, bottomLeft: o.bottomLeft, bottomRight: o.bottomRight)
  }
}
