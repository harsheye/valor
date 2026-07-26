import { Component, ElementRef, Input, OnInit, OnDestroy, Output, EventEmitter, ViewChild } from '@angular/core';
import { MediaPlayer } from '@our-player/sdk';

@Component({
  selector: 'valor-player',
  template: '<div #playerContainer style="width: 100%; height: 100%;"></div>'
})
export class ValorPlayerComponent implements OnInit, OnDestroy {
  @ViewChild('playerContainer', { static: true }) playerContainer!: ElementRef;

  @Input() media?: string;
  @Input() controls?: any;
  @Input() theme?: any;
  @Input() domain?: string;

  @Output() ready = new EventEmitter<void>();
  @Output() playEvent = new EventEmitter<void>();
  @Output() pauseEvent = new EventEmitter<void>();
  @Output() timeUpdate = new EventEmitter<any>();
  @Output() seekEvent = new EventEmitter<any>();

  private player: MediaPlayer | null = null;

  ngOnInit() {
    this.player = new MediaPlayer({
      container: this.playerContainer.nativeElement,
      media: this.media,
      controls: this.controls,
      theme: this.theme,
      domain: this.domain
    });

    this.player.on('ready', () => this.ready.emit());
    this.player.on('play', () => this.playEvent.emit());
    this.player.on('pause', () => this.pauseEvent.emit());
    this.player.on('time_update', (data: any) => this.timeUpdate.emit(data));
    this.player.on('seek', (data: any) => this.seekEvent.emit(data));
  }

  ngOnDestroy() {
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
  }
}
