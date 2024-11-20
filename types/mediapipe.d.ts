declare module "@mediapipe/tasks-vision" {
  export class FaceLandmarker {
    static createFromOptions(
      filesetResolver: FilesetResolver,
      options: any
    ): Promise<FaceLandmarker>;
    detectForVideo(video: HTMLVideoElement, timestamp: number): any;
  }

  export class FilesetResolver {
    static forVisionTasks(wasmFilePath: string): Promise<FilesetResolver>;
  }
}
