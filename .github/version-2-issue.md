The retrain job counted enough shared spaced reviews to train and gate the sequence model described in the README.

What it is: a small GRU over the last 16 reviews of a card, with the version 1 count features appended, trained with the same log-loss objective, exported to ONNX, served by the same FastAPI function through onnxruntime.

All three gates must pass before it ships. If any fails, version 1 stays and the comparison goes in the case study as a negative result.

- [ ] On a held-out-by-user split of the app's own logs with at least 50,000 reviews, log-loss improves over the deployed model by at least 3 percent relative, and calibration is no worse in any of the ten bins.
- [ ] The workload simulation shows fewer reviews per day at the same 90 percent retention, or higher retention at the same workload.
- [ ] The Why this date panel still explains the prediction on one screen: the reviews it weighed and the half-life it produced.
