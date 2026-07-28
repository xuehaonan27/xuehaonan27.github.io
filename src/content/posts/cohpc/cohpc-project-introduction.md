---
title: "CoHPC Project Introduction"
pubDatetime: 2025-10-09T20:33:41+08:00
description: "Introduction to the CoHPC (Cloud on HPC) project: launching VMs on HPC clusters without privileges."
tags:
  - cohpc
---

This section records develop process of `COHPC` (Cloud on HPC). The project has been made open source and source code could be found [here](https://github.com/xuehaonan27/cohpc).


## CoHPC Project Introduction
This project is meant to build a system that could launch virtual machines on a HPC cluster.

On a HPC cluster, user could not have privilege (such as by `sudo`) and usually require user to submit tasks via task schedulers such as [Slurm](https://www.schedmd.com/slurm/) workload manager.

[CoHPC](https://github.com/xuehaonan27/cohpc) provides a way to launch virtual machines and mount files into the virtual machine, and all these could be done without any privilege.

## Possible application scenario
Assuming you processed a bunch of data on a HPC cluster. It's usually big (especially data in fields like chemistry, biology, etc.) and expensive to download data and visualizing or processing them locally, while sometimes you might want to just have a look whether this bunch of data is feasible or not.

So with [CoHPC](https://github.com/xuehaonan27/cohpc) you could launch a VM in seconds (including Windows ones), mount your data into the VM and utilize tools pre-installed in the VM to deal with the data, e.g. visualize them, and without transmitting all those data.
